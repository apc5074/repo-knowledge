import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  createComposeProjectName,
  detectComposeFilePaths,
  getComposeServiceTargets,
  startComposeServices
} from "./compose.js";
import { loadRuntimeContract } from "./contract-loader.js";
import { resolveRuntimeEnvironment } from "./environment.js";
import { runRuntimeHealthChecks } from "./health-checks.js";
import { createBootstrapPlan } from "./plan.js";
import { checkRuntimePorts } from "./ports.js";
import { startApplicationProcesses } from "./process-manager.js";
import { attachPrerequisitesToPlan, inspectRuntimePrerequisites } from "./prerequisites.js";
import { resolveRuntimeBudget } from "./runtime-budget.js";
import { runSetupSteps } from "./setup-runner.js";
import {
  createJsonRuntimeStateStore,
  resolveRuntimeStateStorePaths,
  type RuntimeStateStore
} from "./state-store.js";
import { stopRuntime } from "./stop.js";
import type {
  BootstrapPlan,
  BootstrapSession,
  RuntimeHealthCheckResult,
  RuntimeResource,
  RuntimeStatus,
  RuntimeStep,
  StartRuntimeInput,
  StartRuntimeResult
} from "./types.js";

export async function startRuntime(input: StartRuntimeInput): Promise<StartRuntimeResult> {
  const contractLoad =
    input.contract === undefined
      ? await loadRuntimeContract(input)
      : {
          ok: true as const,
          path: input.contractPath,
          contract: input.contract,
          warnings: []
        };

  if (!contractLoad.ok) {
    const plan = createBootstrapPlan({
      ...input,
      contractPath: contractLoad.path,
      dryRun: input.dryRun ?? false
    });

    return {
      ok: false,
      status: "failed",
      summary: contractLoad.message,
      warnings: contractLoad.warnings,
      errors: [contractLoad.message],
      nextSteps: contractLoad.nextSteps,
      plan
    };
  }

  let plan = createBootstrapPlan({
    ...input,
    contract: contractLoad.contract,
    contractPath: contractLoad.path,
    dryRun: input.dryRun ?? false
  });

  if (plan.dryRun) {
    return {
      ok: true,
      status: "pending",
      summary: "Built bootstrap runtime dry-run plan.",
      warnings: [...contractLoad.warnings, ...plan.warnings],
      errors: [],
      nextSteps: ["Run board start without --dry-run to execute this plan."],
      plan
    };
  }

  const stateStore = input.stateStore ?? defaultRuntimeStateStore(input.repositoryRoot);
  await stateStore.ensure();
  const budget = resolveRuntimeBudget({
    ...input.budget,
    startupTimeoutSecondsOverride: input.timeoutSeconds
  });
  const startupDeadlineMs = Date.now() + budget.startupTimeoutSeconds * 1_000;

  const startedAt = new Date().toISOString();
  let session = await stateStore.createSession({
    id: input.sessionId ?? `runtime-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    repositoryRoot: input.repositoryRoot,
    status: "running",
    startedAt,
    steps: markStep(plan.steps, "load-contract", "succeeded", "Repository contract loaded."),
    resources: plan.resources,
    commandResults: [],
    healthCheckResults: [],
    budget,
    warnings: [...contractLoad.warnings, ...plan.warnings],
    errors: []
  });

  try {
    throwIfStartupTimedOut(startupDeadlineMs, "inspect-prerequisites");
    throwIfStartupInterrupted(input.interruptSignal, "inspect-prerequisites");
    const prerequisites = await inspectRuntimePrerequisites({ plan });
    plan = attachPrerequisitesToPlan(plan, prerequisites);
    session = await persistSession(stateStore, {
      ...session,
      steps: markStep(
        session.steps,
        "inspect-prerequisites",
        "succeeded",
        "Prerequisites inspected."
      ),
      warnings: [...session.warnings, ...prerequisiteWarnings(prerequisites)]
    });

    throwIfStartupTimedOut(startupDeadlineMs, "resolve-environment");
    throwIfStartupInterrupted(input.interruptSignal, "resolve-environment");
    const environment = resolveRuntimeEnvironment({
      contract: contractLoad.contract,
      plan,
      env: input.env
    });
    session = await persistSession(stateStore, {
      ...session,
      steps: markStep(
        session.steps,
        "resolve-environment",
        environment.errors.length === 0 ? "succeeded" : "failed",
        environment.errors.length === 0
          ? "Environment variable names resolved."
          : "Required environment is missing."
      ),
      warnings: [...session.warnings, ...environment.warnings],
      errors: [...session.errors, ...environment.errors]
    });

    throwIfStartupTimedOut(startupDeadlineMs, firstPendingStepId(session, "setup"));
    throwIfStartupInterrupted(input.interruptSignal, firstPendingStepId(session, "setup"));
    const portAvailability = await checkRuntimePorts({ plan, mode: "availability" });
    session = await persistSession(stateStore, {
      ...session,
      resources: mergeResources(
        session.resources,
        portAvailability.map((port) => ({
          id: port.id,
          kind: "port",
          status: port.status === "available" ? "succeeded" : "failed",
          label: `${port.ownerId}:${port.port}`,
          ownerSessionId: session.id,
          metadata: {
            ownerId: port.ownerId,
            port: port.port,
            host: port.host,
            mode: port.mode
          }
        }))
      )
    });

    throwIfStartupTimedOut(startupDeadlineMs, firstPendingStepId(session, "setup"));
    throwIfStartupInterrupted(input.interruptSignal, firstPendingStepId(session, "setup"));
    const setupResult = await runSetupSteps({
      plan,
      environment,
      defaultTimeoutSeconds: budget.commandTimeoutSeconds,
      maxOutputBytes: budget.outputExcerptBytes,
      maxSetupSteps: budget.maxSetupSteps
    });
    session = await persistSession(stateStore, {
      ...session,
      steps: setupResult.steps,
      commandResults: [...session.commandResults, ...setupResult.commandResults],
      warnings: [...session.warnings, ...setupResult.warnings],
      errors: [...session.errors, ...setupResult.errors]
    });

    if (session.errors.length === 0) {
      throwIfStartupTimedOut(startupDeadlineMs, firstPendingStepId(session, "service"));
      throwIfStartupInterrupted(input.interruptSignal, firstPendingStepId(session, "service"));
      session = await startComposePhase({
        input,
        stateStore,
        session,
        plan,
        contract: contractLoad.contract
      });
    }

    if (session.errors.length === 0) {
      throwIfStartupTimedOut(startupDeadlineMs, firstPendingStepId(session, "application"));
      throwIfStartupInterrupted(input.interruptSignal, firstPendingStepId(session, "application"));
      const appResult = await startApplicationProcesses({
        plan,
        sessionId: session.id,
        repositoryRoot: input.repositoryRoot,
        stateStore,
        environment,
        earlyExitMs: budget.processReadyProbeMs,
        maxLogBytes: budget.outputExcerptBytes,
        maxProcesses: budget.maxTrackedProcesses
      });
      session = await persistSession(stateStore, {
        ...session,
        steps: appResult.steps,
        resources: mergeResources(session.resources, appResult.resources),
        commandResults: [...session.commandResults, ...appResult.commandResults],
        warnings: [...session.warnings, ...appResult.warnings],
        errors: [...session.errors, ...appResult.errors]
      });
    }

    throwIfStartupTimedOut(startupDeadlineMs, firstPendingStepId(session, "health-check"));
    throwIfStartupInterrupted(input.interruptSignal, firstPendingStepId(session, "health-check"));
    const portListening = await checkRuntimePorts({ plan, mode: "listening" });
    session = await persistSession(stateStore, {
      ...session,
      resources: mergeResources(
        session.resources,
        portListening.map((port) => ({
          id: port.id,
          kind: "port",
          status: port.status === "listening" ? "succeeded" : "failed",
          label: `${port.ownerId}:${port.port}`,
          ownerSessionId: session.id,
          metadata: {
            ownerId: port.ownerId,
            port: port.port,
            host: port.host,
            mode: port.mode
          }
        }))
      )
    });

    throwIfStartupTimedOut(startupDeadlineMs, firstPendingStepId(session, "health-check"));
    throwIfStartupInterrupted(input.interruptSignal, firstPendingStepId(session, "health-check"));
    const healthCheckResults = await runRuntimeHealthChecks({
      plan,
      enabled: input.healthChecks !== false,
      environment,
      timeoutMs: budget.healthCheckTimeoutMs
    });
    session = await persistSession(stateStore, {
      ...session,
      steps: completeHealthSteps(session.steps, healthCheckResults),
      resources: mergeResources(session.resources, healthResources(session.id, healthCheckResults)),
      healthCheckResults
    });

    throwIfStartupTimedOut(startupDeadlineMs, "record-state");
    throwIfStartupInterrupted(input.interruptSignal, "record-state");
    const finalStatus = summarizeSessionStatus(session);
    session = await persistSession(stateStore, {
      ...session,
      status: finalStatus,
      completedAt: finalStatus === "running" ? undefined : new Date().toISOString(),
      steps: markStep(session.steps, "record-state", "succeeded", "Runtime session state recorded.")
    });
  } catch (error) {
    if (error instanceof StartupInterruptedError) {
      return recordInterruptedStartup({
        input,
        stateStore,
        session,
        plan,
        stepId: error.stepId,
        message: error.message
      });
    }

    if (error instanceof StartupTimedOutError) {
      return recordTimedOutStartup({
        input,
        stateStore,
        session,
        plan,
        stepId: error.stepId,
        message: error.message
      });
    }

    throw error;
  }

  return {
    ok: session.errors.length === 0,
    status: session.status,
    summary:
      session.errors.length === 0
        ? "Bootstrap runtime completed startup orchestration."
        : "Bootstrap runtime recorded a failed startup.",
    warnings: session.warnings,
    errors: session.errors,
    nextSteps:
      session.errors.length === 0
        ? ["Run board status to inspect the active runtime session."]
        : ["Inspect failed steps, fix the local issue, then rerun board start."],
    plan,
    session
  };
}

class StartupInterruptedError extends Error {
  readonly stepId: string;

  constructor(stepId: string, message: string) {
    super(message);
    this.name = "StartupInterruptedError";
    this.stepId = stepId;
  }
}

class StartupTimedOutError extends Error {
  readonly stepId: string;

  constructor(stepId: string, message: string) {
    super(message);
    this.name = "StartupTimedOutError";
    this.stepId = stepId;
  }
}

function defaultRuntimeStateStore(repositoryRoot: string): RuntimeStateStore {
  return createJsonRuntimeStateStore(
    resolveRuntimeStateStorePaths({
      repositoryStateRoot: join(repositoryRoot, ".board", "state")
    })
  );
}

async function persistSession(
  stateStore: RuntimeStateStore,
  session: BootstrapSession
): Promise<BootstrapSession> {
  return stateStore.updateSession(session);
}

async function recordInterruptedStartup(input: {
  readonly input: StartRuntimeInput;
  readonly stateStore: RuntimeStateStore;
  readonly session: BootstrapSession;
  readonly plan: BootstrapPlan;
  readonly stepId: string;
  readonly message: string;
}): Promise<StartRuntimeResult> {
  const interruptedSession = await persistSession(input.stateStore, {
    ...input.session,
    status: "interrupted",
    completedAt: new Date().toISOString(),
    steps: markStep(
      markPendingSteps(input.session.steps, "skipped", "Skipped because startup was interrupted."),
      input.stepId,
      "interrupted",
      "Startup was interrupted before this step completed."
    ),
    warnings: [
      ...input.session.warnings,
      "Startup was interrupted; Board attempted cleanup for resources started in this session."
    ],
    errors: [...input.session.errors, input.message]
  });
  const cleanup = await stopRuntime({
    repositoryRoot: input.input.repositoryRoot,
    sessionId: interruptedSession.id,
    force: true,
    stateStore: input.stateStore
  });
  const cleanedSession =
    (await input.stateStore.readSession(interruptedSession.id)) ?? interruptedSession;
  const finalSession = await persistSession(input.stateStore, {
    ...cleanedSession,
    status: "interrupted",
    completedAt: new Date().toISOString(),
    steps: markStep(
      cleanedSession.steps,
      input.stepId,
      "interrupted",
      "Startup was interrupted before this step completed."
    ),
    warnings: uniqueStrings([...interruptedSession.warnings, ...cleanup.warnings]),
    errors: uniqueStrings([...interruptedSession.errors, ...cleanup.errors])
  });

  return {
    ok: false,
    status: "interrupted",
    summary: "Bootstrap runtime startup was interrupted; cleanup was attempted.",
    warnings: finalSession.warnings,
    errors: finalSession.errors,
    nextSteps: [
      "Run board status to inspect the interrupted session.",
      "Run board stop --force if any Board-managed resources are still running."
    ],
    plan: input.plan,
    session: finalSession
  };
}

async function recordTimedOutStartup(input: {
  readonly input: StartRuntimeInput;
  readonly stateStore: RuntimeStateStore;
  readonly session: BootstrapSession;
  readonly plan: BootstrapPlan;
  readonly stepId: string;
  readonly message: string;
}): Promise<StartRuntimeResult> {
  const timedOutSession = await persistSession(input.stateStore, {
    ...input.session,
    status: "timed_out",
    completedAt: new Date().toISOString(),
    steps: markStep(
      markPendingSteps(input.session.steps, "skipped", "Skipped because startup timed out."),
      input.stepId,
      "timed_out",
      "Startup timed out before this step completed."
    ),
    warnings: [
      ...input.session.warnings,
      "Startup timed out; Board attempted cleanup for resources started in this session."
    ],
    errors: [...input.session.errors, input.message]
  });
  const cleanup = await stopRuntime({
    repositoryRoot: input.input.repositoryRoot,
    sessionId: timedOutSession.id,
    force: true,
    stateStore: input.stateStore
  });
  const cleanedSession =
    (await input.stateStore.readSession(timedOutSession.id)) ?? timedOutSession;
  const finalSession = await persistSession(input.stateStore, {
    ...cleanedSession,
    status: "timed_out",
    completedAt: new Date().toISOString(),
    steps: markStep(
      cleanedSession.steps,
      input.stepId,
      "timed_out",
      "Startup timed out before this step completed."
    ),
    warnings: uniqueStrings([...timedOutSession.warnings, ...cleanup.warnings]),
    errors: uniqueStrings([...timedOutSession.errors, ...cleanup.errors])
  });

  return {
    ok: false,
    status: "timed_out",
    summary: "Bootstrap runtime startup timed out; cleanup was attempted.",
    warnings: finalSession.warnings,
    errors: finalSession.errors,
    nextSteps: [
      "Run board status to inspect the timed-out session.",
      "Run board stop --force if any Board-managed resources are still running."
    ],
    plan: input.plan,
    session: finalSession
  };
}

async function startComposePhase(input: {
  readonly input: StartRuntimeInput;
  readonly stateStore: RuntimeStateStore;
  readonly session: BootstrapSession;
  readonly plan: BootstrapPlan;
  readonly contract: NonNullable<StartRuntimeInput["contract"]>;
}): Promise<BootstrapSession> {
  const targets = getComposeServiceTargets(input.contract);

  if (targets.length === 0) {
    return input.session;
  }

  const projectName = createComposeProjectName({
    repositoryRoot: input.input.repositoryRoot,
    sessionId: input.session.id
  });
  const commandResult = await startComposeServices({
    repositoryRoot: input.input.repositoryRoot,
    projectName,
    composeFiles: detectComposeFilePaths({
      repositoryRoot: input.input.repositoryRoot,
      contract: input.contract
    }),
    services: targets.map((target) => target.composeService)
  });
  const status: RuntimeStatus = commandResult.status === "succeeded" ? "running" : "failed";

  return persistSession(input.stateStore, {
    ...input.session,
    steps: updateStepsByIds(
      input.session.steps,
      targets.map((target) => `service-${target.serviceId}`),
      status,
      commandResult.status === "succeeded"
        ? "Compose service started."
        : "Compose service failed to start."
    ),
    resources: mergeResources(
      input.session.resources,
      targets.map((target) => ({
        id: `compose-service-${target.serviceId}`,
        kind: "compose-service",
        status,
        ownerSessionId: input.session.id,
        label: target.composeService,
        metadata: {
          serviceId: target.serviceId,
          composeService: target.composeService,
          projectName
        }
      }))
    ),
    commandResults: [...input.session.commandResults, commandResult],
    errors:
      commandResult.status === "succeeded"
        ? input.session.errors
        : [...input.session.errors, "Docker Compose services failed to start."]
  });
}

function prerequisiteWarnings(
  prerequisites: readonly {
    readonly id: string;
    readonly status: string;
    readonly command: string;
  }[]
): readonly string[] {
  return prerequisites
    .filter((prerequisite) => prerequisite.status !== "available")
    .map(
      (prerequisite) =>
        `${prerequisite.id} prerequisite ${prerequisite.command} is ${prerequisite.status}.`
    );
}

function markStep(
  steps: readonly RuntimeStep[],
  id: string,
  status: RuntimeStatus,
  summary: string
): readonly RuntimeStep[] {
  return updateStepsByIds(steps, [id], status, summary);
}

function updateStepsByIds(
  steps: readonly RuntimeStep[],
  ids: readonly string[],
  status: RuntimeStatus,
  summary: string
): readonly RuntimeStep[] {
  const idSet = new Set(ids);
  const now = new Date().toISOString();

  return steps.map((step) =>
    idSet.has(step.id)
      ? {
          ...step,
          status,
          summary,
          startedAt: step.startedAt ?? now,
          completedAt: status === "running" ? undefined : now
        }
      : step
  );
}

function markPendingSteps(
  steps: readonly RuntimeStep[],
  status: RuntimeStatus,
  summary: string
): readonly RuntimeStep[] {
  const now = new Date().toISOString();

  return steps.map((step) =>
    step.status === "pending"
      ? {
          ...step,
          status,
          summary,
          completedAt: now
        }
      : step
  );
}

function throwIfStartupInterrupted(signal: AbortSignal | undefined, stepId: string): void {
  if (signal?.aborted === true) {
    throw new StartupInterruptedError(stepId, formatInterruptedReason(signal.reason));
  }
}

function throwIfStartupTimedOut(deadlineMs: number, stepId: string): void {
  if (Date.now() > deadlineMs) {
    throw new StartupTimedOutError(stepId, "Startup exceeded the configured runtime timeout.");
  }
}

function firstPendingStepId(session: BootstrapSession, preferredKind: RuntimeStep["kind"]): string {
  return (
    session.steps.find((step) => step.status === "pending" && step.kind === preferredKind)?.id ??
    session.steps.find((step) => step.status === "pending")?.id ??
    "record-state"
  );
}

function formatInterruptedReason(reason: unknown): string {
  if (typeof reason === "string" && reason.length > 0) {
    return reason;
  }

  return "Startup was interrupted.";
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function completeHealthSteps(
  steps: readonly RuntimeStep[],
  results: readonly RuntimeHealthCheckResult[]
): readonly RuntimeStep[] {
  return results.reduce(
    (current, result) =>
      markStep(
        current,
        result.id,
        result.status,
        result.status === "succeeded" ? `${result.id} passed.` : `${result.id} ${result.status}.`
      ),
    steps
  );
}

function healthResources(
  sessionId: string,
  results: readonly RuntimeHealthCheckResult[]
): readonly RuntimeResource[] {
  return results.map((result) => ({
    id: result.id,
    kind: "health-check",
    status: result.status,
    ownerSessionId: sessionId,
    label: result.target,
    metadata: {
      target: result.target
    }
  }));
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

function summarizeSessionStatus(session: BootstrapSession): RuntimeStatus {
  if (session.errors.length > 0) {
    return "failed";
  }

  if (
    session.healthCheckResults.some((result) => ["failed", "timed_out"].includes(result.status))
  ) {
    return "failed";
  }

  if (session.resources.some((resource) => resource.status === "running")) {
    return "running";
  }

  return "succeeded";
}
