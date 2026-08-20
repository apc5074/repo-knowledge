import { join } from "node:path";

import { stopComposeProject } from "./compose.js";
import { stopManagedProcess } from "./process-manager.js";
import {
  createJsonRuntimeStateStore,
  resolveRuntimeStateStorePaths,
  type RuntimeStateStore
} from "./state-store.js";
import type {
  BootstrapSession,
  ManagedProcessRecord,
  RuntimeCommandResult,
  RuntimeResource,
  RuntimeStatus,
  StopRuntimeInput,
  StopRuntimeResult
} from "./types.js";

export async function stopRuntime(input: StopRuntimeInput): Promise<StopRuntimeResult> {
  const stateStore = input.stateStore ?? defaultRuntimeStateStore(input.repositoryRoot);
  await stateStore.ensure();

  const allSessions = await stateStore.listSessions();
  const latestSession = await stateStore.readLatestSession();
  const targetSessions = selectTargetSessions(allSessions, latestSession, input);

  if (targetSessions.length === 0) {
    return {
      ok: false,
      status: "unknown",
      summary:
        input.sessionId === undefined
          ? "No Board-managed runtime session is available to stop."
          : `Runtime session ${input.sessionId} was not found.`,
      warnings: [],
      errors: [],
      nextSteps: ["Run board status or board start to create a runtime session first."],
      stoppedSessionIds: [],
      stoppedResources: []
    };
  }

  const processRecords = await stateStore.readProcesses();
  const stoppedResources: RuntimeResource[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const session of targetSessions) {
    const sessionProcesses = processRecords.filter(
      (record) => record.repositoryRoot === input.repositoryRoot && record.sessionId === session.id
    );
    const processResults = await stopSessionProcesses(sessionProcesses, stateStore, input.force);
    stoppedResources.push(...processResults.resources);

    const composeResults = await stopSessionComposeProjects(session, input);
    stoppedResources.push(...composeResults.resources);
    warnings.push(...composeResults.warnings);
    errors.push(...composeResults.errors);

    const updatedSession = buildStoppedSession(session, [
      ...processResults.resources,
      ...composeResults.resources
    ]);
    await stateStore.updateSession(updatedSession);
  }

  return {
    ok: errors.length === 0,
    status: errors.length === 0 ? "stopped" : "failed",
    summary:
      errors.length === 0
        ? "Stopped Board-managed runtime resources."
        : "Board stopped some runtime resources but encountered failures.",
    warnings,
    errors,
    nextSteps:
      errors.length === 0
        ? ["Run board status to confirm the runtime session is stopped."]
        : ["Inspect the failed stop operations, then rerun board stop --force if needed."],
    stoppedSessionIds: targetSessions.map((session) => session.id),
    stoppedResources: dedupeResources(stoppedResources)
  };
}

function defaultRuntimeStateStore(repositoryRoot: string): RuntimeStateStore {
  return createJsonRuntimeStateStore(
    resolveRuntimeStateStorePaths({
      repositoryStateRoot: join(repositoryRoot, ".board", "state")
    })
  );
}

function selectTargetSessions(
  sessions: readonly BootstrapSession[],
  latestSession: BootstrapSession | undefined,
  input: StopRuntimeInput
): readonly BootstrapSession[] {
  const repositorySessions = sessions.filter(
    (session) => session.repositoryRoot === input.repositoryRoot
  );

  if (input.all === true) {
    return repositorySessions;
  }

  if (input.sessionId !== undefined) {
    return repositorySessions.filter((session) => session.id === input.sessionId);
  }

  return latestSession !== undefined && latestSession.repositoryRoot === input.repositoryRoot
    ? [latestSession]
    : [];
}

async function stopSessionProcesses(
  processes: readonly ManagedProcessRecord[],
  stateStore: RuntimeStateStore,
  force: boolean | undefined
): Promise<{ readonly resources: readonly RuntimeResource[] }> {
  const resources: RuntimeResource[] = [];

  for (const process of processes) {
    resources.push(
      await stopManagedProcess({
        record: process,
        stateStore,
        force
      })
    );
  }

  return { resources };
}

async function stopSessionComposeProjects(
  session: BootstrapSession,
  input: StopRuntimeInput
): Promise<{
  readonly resources: readonly RuntimeResource[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}> {
  const resources: RuntimeResource[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const projectNames = [
    ...new Set(
      session.resources
        .filter((resource) => resource.kind === "compose-service")
        .map((resource) => stringMetadata(resource.metadata?.projectName))
        .filter((projectName): projectName is string => projectName !== undefined)
    )
  ];

  for (const projectName of projectNames) {
    const result = await (input.stopCompose ?? defaultStopCompose)({
      repositoryRoot: input.repositoryRoot,
      projectName
    });

    const composeResources = session.resources
      .filter(
        (resource) =>
          resource.kind === "compose-service" &&
          stringMetadata(resource.metadata?.projectName) === projectName
      )
      .map(
        (resource) =>
          ({
            ...resource,
            status: result.status === "succeeded" ? "stopped" : "failed"
          }) satisfies RuntimeResource
      );

    resources.push(...composeResources);

    if (result.status !== "succeeded") {
      errors.push(`Compose project ${projectName} failed to stop.`);
    } else if (composeResources.length === 0) {
      warnings.push(`Compose project ${projectName} was recorded without service resources.`);
    }
  }

  return {
    resources,
    warnings,
    errors
  };
}

async function defaultStopCompose(input: {
  readonly repositoryRoot: string;
  readonly projectName: string;
  readonly down?: boolean;
}): Promise<RuntimeCommandResult> {
  return stopComposeProject({
    repositoryRoot: input.repositoryRoot,
    projectName: input.projectName,
    down: input.down
  });
}

function buildStoppedSession(
  session: BootstrapSession,
  stoppedResources: readonly RuntimeResource[]
): BootstrapSession {
  const resources = new Map(session.resources.map((resource) => [resource.id, resource]));

  for (const resource of stoppedResources) {
    resources.set(resource.id, {
      ...resources.get(resource.id),
      ...resource
    });
  }

  return {
    ...session,
    status: summarizeStoppedSessionStatus(stoppedResources),
    completedAt: new Date().toISOString(),
    resources: [...resources.values()].sort((left, right) => left.id.localeCompare(right.id))
  };
}

function summarizeStoppedSessionStatus(resources: readonly RuntimeResource[]): RuntimeStatus {
  return resources.some((resource) => resource.status === "failed") ? "failed" : "stopped";
}

function dedupeResources(resources: readonly RuntimeResource[]): readonly RuntimeResource[] {
  const deduped = new Map(resources.map((resource) => [resource.id, resource]));
  return [...deduped.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function stringMetadata(value: string | number | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
