import {
  formatRuntimeStatusReport,
  formatStartRuntimeReport,
  formatStopRuntimeReport
} from "./reports.js";
import { createBootstrapPlan } from "./plan.js";
import { getRuntimeStatus } from "./status.js";
import { startRuntime } from "./orchestrator.js";
import { stopRuntime } from "./stop.js";
import type {
  BootstrapPlanInput,
  BootstrapPlanResult,
  RuntimeFormattedReport,
  RuntimeStatusInput,
  RuntimeStatusResult,
  StartRuntimeInput,
  StartRuntimeResult,
  StopRuntimeInput,
  StopRuntimeResult
} from "./types.js";
import type { RuntimeStateStore } from "./state-store.js";

export const bootstrapRuntimeToolNames = [
  "bootstrap.plan",
  "bootstrap.start",
  "bootstrap.status",
  "bootstrap.stop"
] as const;

export type BootstrapRuntimeToolName = (typeof bootstrapRuntimeToolNames)[number];

export type RuntimeToolSideEffect =
  | "none"
  | "local-state-write"
  | "local-command-execution"
  | "local-process-start"
  | "local-process-stop"
  | "docker-compose-start"
  | "docker-compose-stop";

export type RuntimeToolPolicyMetadata = {
  readonly requiresApproval: boolean;
  readonly approvalReason?: string;
  readonly allowedForAgents: boolean;
};

export type RuntimeToolMetadata = {
  readonly name: BootstrapRuntimeToolName;
  readonly description: string;
  readonly localSideEffects: readonly RuntimeToolSideEffect[];
  readonly policy: RuntimeToolPolicyMetadata;
  readonly redactionGuarantees: readonly string[];
  readonly inputSchema: "typed-placeholder";
  readonly outputSchema: "typed-placeholder";
};

export type RuntimeToolExecutionContext = {
  readonly stateStore?: RuntimeStateStore;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly interruptSignal?: AbortSignal;
};

export type BootstrapRuntimeToolResult<T> = {
  readonly toolName: BootstrapRuntimeToolName;
  readonly metadata: RuntimeToolMetadata;
  readonly ok: boolean;
  readonly report: RuntimeFormattedReport;
  readonly result: T;
};

export const bootstrapRuntimeToolMetadata: readonly RuntimeToolMetadata[] = [
  {
    name: "bootstrap.plan",
    description: "Build a local bootstrap plan from a repository contract.",
    localSideEffects: ["none"],
    policy: {
      requiresApproval: false,
      allowedForAgents: true
    },
    redactionGuarantees: [
      "Does not execute commands.",
      "Does not read or persist environment variable values."
    ],
    inputSchema: "typed-placeholder",
    outputSchema: "typed-placeholder"
  },
  {
    name: "bootstrap.start",
    description: "Start contract-defined local setup, services, apps, and health checks.",
    localSideEffects: [
      "local-state-write",
      "local-command-execution",
      "local-process-start",
      "docker-compose-start"
    ],
    policy: {
      requiresApproval: true,
      approvalReason: "Executes local commands and may start processes or Compose services.",
      allowedForAgents: true
    },
    redactionGuarantees: [
      "Persists variable names but not raw environment values.",
      "Redacts selected environment values from command output excerpts.",
      "Bounds stored command output excerpts."
    ],
    inputSchema: "typed-placeholder",
    outputSchema: "typed-placeholder"
  },
  {
    name: "bootstrap.status",
    description: "Read persisted runtime session state and refresh managed process status.",
    localSideEffects: ["none"],
    policy: {
      requiresApproval: false,
      allowedForAgents: true
    },
    redactionGuarantees: [
      "Returns previously redacted stored output only.",
      "Does not read raw environment files."
    ],
    inputSchema: "typed-placeholder",
    outputSchema: "typed-placeholder"
  },
  {
    name: "bootstrap.stop",
    description: "Stop Board-managed runtime resources recorded for a repository session.",
    localSideEffects: ["local-state-write", "local-process-stop", "docker-compose-stop"],
    policy: {
      requiresApproval: true,
      approvalReason: "Stops local processes or Compose projects previously started by Board.",
      allowedForAgents: true
    },
    redactionGuarantees: [
      "Stops only resources recorded in Board runtime state.",
      "Does not inspect or persist raw environment values."
    ],
    inputSchema: "typed-placeholder",
    outputSchema: "typed-placeholder"
  }
] as const;

export function getBootstrapRuntimeToolMetadata(
  name: BootstrapRuntimeToolName
): RuntimeToolMetadata {
  return bootstrapRuntimeToolMetadata.find((tool) => tool.name === name) as RuntimeToolMetadata;
}

export async function planBootstrapRuntimeTool(
  input: BootstrapPlanInput
): Promise<BootstrapRuntimeToolResult<BootstrapPlanResult>> {
  const plan = createBootstrapPlan(input);
  const result: BootstrapPlanResult = {
    ok: true,
    status: "pending",
    summary:
      input.contract !== undefined
        ? "Built bootstrap runtime plan from repository contract."
        : "Built bootstrap runtime plan skeleton.",
    warnings: plan.warnings,
    errors: [],
    nextSteps:
      input.contract !== undefined
        ? ["Run board start --dry-run to inspect the planned local bootstrap steps."]
        : ["Load a repository contract before executing the runtime plan."],
    plan
  };
  const report = {
    summary: result.summary,
    human: result.summary,
    details: {
      status: result.status,
      steps: emptyCounts(result.plan.steps.length),
      resources: emptyCounts(result.plan.resources.length),
      healthChecks: emptyCounts(0),
      services: result.plan.resources
        .filter((resource) => resource.kind === "compose-service")
        .map((resource) => resource.label ?? resource.id),
      applications: result.plan.resources
        .filter((resource) => resource.kind === "process")
        .map((resource) => resource.label ?? resource.id),
      ports: [],
      failedStepIds: [],
      failedResourceIds: [],
      durations: {
        commandMs: 0,
        healthCheckMs: 0
      },
      nextSteps: result.nextSteps
    }
  } satisfies RuntimeFormattedReport;

  return toolResult("bootstrap.plan", result.ok, report, result);
}

export async function startBootstrapRuntimeTool(
  input: Omit<StartRuntimeInput, "stateStore" | "env" | "interruptSignal">,
  context: RuntimeToolExecutionContext = {}
): Promise<BootstrapRuntimeToolResult<StartRuntimeResult>> {
  const result = await startRuntime({
    ...input,
    stateStore: context.stateStore,
    env: context.env,
    interruptSignal: context.interruptSignal
  });

  return toolResult("bootstrap.start", result.ok, formatStartRuntimeReport(result), result);
}

export async function getBootstrapRuntimeStatusTool(
  input: Omit<RuntimeStatusInput, "stateStore">,
  context: Pick<RuntimeToolExecutionContext, "stateStore"> = {}
): Promise<BootstrapRuntimeToolResult<RuntimeStatusResult>> {
  const result = await getRuntimeStatus({
    ...input,
    stateStore: context.stateStore
  });

  return toolResult("bootstrap.status", result.ok, formatRuntimeStatusReport(result), result);
}

export async function stopBootstrapRuntimeTool(
  input: Omit<StopRuntimeInput, "stateStore" | "stopCompose">,
  context: Pick<RuntimeToolExecutionContext, "stateStore"> = {}
): Promise<BootstrapRuntimeToolResult<StopRuntimeResult>> {
  const result = await stopRuntime({
    ...input,
    stateStore: context.stateStore
  });

  return toolResult("bootstrap.stop", result.ok, formatStopRuntimeReport(result), result);
}

function toolResult<T>(
  toolName: BootstrapRuntimeToolName,
  ok: boolean,
  report: RuntimeFormattedReport,
  result: T
): BootstrapRuntimeToolResult<T> {
  return {
    toolName,
    metadata: getBootstrapRuntimeToolMetadata(toolName),
    ok,
    report,
    result
  };
}

function emptyCounts(total: number): RuntimeFormattedReport["details"]["steps"] {
  return {
    total,
    pending: total,
    running: 0,
    succeeded: 0,
    failed: 0,
    interrupted: 0,
    skipped: 0,
    timedOut: 0,
    stopped: 0,
    unknown: 0
  };
}
