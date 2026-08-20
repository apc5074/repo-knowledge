import { join } from "node:path";

import { getManagedProcessStatus } from "./process-manager.js";
import {
  createJsonRuntimeStateStore,
  resolveRuntimeStateStorePaths,
  type RuntimeStateStore
} from "./state-store.js";
import type {
  BootstrapSession,
  RuntimeResource,
  RuntimeStatusInput,
  RuntimeStatusResult
} from "./types.js";

export async function getRuntimeStatus(input: RuntimeStatusInput): Promise<RuntimeStatusResult> {
  const stateStore = input.stateStore ?? defaultRuntimeStateStore(input.repositoryRoot);
  await stateStore.ensure();

  const session =
    input.sessionId === undefined
      ? await stateStore.readLatestSession()
      : await stateStore.readSession(input.sessionId);

  if (session === undefined) {
    return {
      ok: false,
      status: "unknown",
      summary:
        input.sessionId === undefined
          ? "No runtime session has been recorded for this repository."
          : `Runtime session ${input.sessionId} was not found.`,
      warnings: [],
      errors: [],
      nextSteps: ["Run board start before requesting runtime status."],
      resources: []
    };
  }

  const processes = (await stateStore.readProcesses()).filter(
    (process) => process.repositoryRoot === input.repositoryRoot && process.sessionId === session.id
  );
  const processResources = processes.map(getManagedProcessStatus);
  const resources = mergeResources(session.resources, processResources);
  const staleProcessResources = processResources.filter(
    (resource) => resource.status !== "running"
  );
  const warnings = [
    ...session.warnings,
    ...staleProcessResources.map(
      (resource) => `${resource.id} is recorded in Board state but is no longer running.`
    )
  ];
  const status = summarizeStatus(session, resources);

  return {
    ok: session.errors.length === 0,
    status,
    summary: `Runtime session ${session.id} is ${status}.`,
    warnings,
    errors: session.errors,
    nextSteps:
      staleProcessResources.length === 0
        ? ["Run board stop to stop Board-managed local resources."]
        : ["Run board stop --force or clear stale runtime state after inspection."],
    session: {
      ...session,
      status,
      resources,
      warnings
    },
    resources
  };
}

function defaultRuntimeStateStore(repositoryRoot: string): RuntimeStateStore {
  return createJsonRuntimeStateStore(
    resolveRuntimeStateStorePaths({
      repositoryStateRoot: join(repositoryRoot, ".board", "state")
    })
  );
}

function mergeResources(
  existing: readonly RuntimeResource[],
  updates: readonly RuntimeResource[]
): readonly RuntimeResource[] {
  const resources = new Map(existing.map((resource) => [resource.id, resource]));

  for (const update of updates) {
    resources.set(update.id, {
      ...resources.get(update.id),
      ...update
    });
  }

  return [...resources.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function summarizeStatus(
  session: BootstrapSession,
  resources: readonly RuntimeResource[]
): BootstrapSession["status"] {
  if (session.status === "interrupted") {
    return "interrupted";
  }

  if (session.status === "timed_out") {
    return "timed_out";
  }

  if (session.errors.length > 0 || resources.some((resource) => resource.status === "failed")) {
    return "failed";
  }

  if (resources.some((resource) => resource.status === "running")) {
    return "running";
  }

  return session.status;
}
