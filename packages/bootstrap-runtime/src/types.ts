import type { RepositoryContract } from "@repo-knowledge/repository-contract";

import type { RuntimeBudgetInput } from "./runtime-budget.js";
import type { RuntimeStateStore } from "./state-store.js";

export const runtimeCommands = ["start", "status", "stop"] as const;
export type RuntimeCommandName = (typeof runtimeCommands)[number];

export const runtimeStatuses = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "interrupted",
  "skipped",
  "timed_out",
  "stopped",
  "unknown"
] as const;
export type RuntimeStatus = (typeof runtimeStatuses)[number];

export type RuntimeStepKind =
  | "load-contract"
  | "inspect-prerequisites"
  | "resolve-environment"
  | "setup"
  | "service"
  | "application"
  | "health-check"
  | "record-state";

export type RuntimeResourceKind = "process" | "compose-service" | "port" | "health-check";

export type RuntimePrerequisiteKind =
  "node" | "python" | "docker" | "docker-compose" | "devcontainer" | "package-manager" | "command";

export type RuntimePrerequisiteStatus = "available" | "missing" | "unknown";

export type RuntimePrerequisiteResult = {
  readonly id: string;
  readonly kind: RuntimePrerequisiteKind;
  readonly command: string;
  readonly args: readonly string[];
  readonly status: RuntimePrerequisiteStatus;
  readonly required: boolean;
  readonly summary: string;
  readonly versionOutput?: string;
};

export type RuntimeEnvironmentVariableStatus = "present" | "missing";

export type RuntimeEnvironmentVariableResult = {
  readonly name: string;
  readonly status: RuntimeEnvironmentVariableStatus;
  readonly required: boolean;
  readonly secret: boolean;
  readonly usedByStepIds: readonly string[];
  readonly hasLocalDefault: boolean;
  readonly summary: string;
};

export type RuntimeEnvironmentResolution = {
  readonly variables: readonly RuntimeEnvironmentVariableResult[];
  readonly values: Readonly<Record<string, string>>;
  readonly missingRequiredNames: readonly string[];
  readonly missingOptionalNames: readonly string[];
  readonly blockedStepIds: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

export type RuntimePortCheckMode = "availability" | "listening";

export type RuntimePortStatus = "available" | "occupied" | "listening" | "closed" | "unknown";

export type RuntimePortCheckResult = {
  readonly id: string;
  readonly port: number;
  readonly host: string;
  readonly ownerId: string;
  readonly mode: RuntimePortCheckMode;
  readonly status: RuntimePortStatus;
  readonly summary: string;
};

export type RuntimePlannedCommand = {
  readonly id?: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly shell: boolean;
  readonly environment: readonly string[];
  readonly timeoutSeconds?: number;
  readonly optional: boolean;
  readonly optionalReason?: string;
};

export type RuntimeStep = {
  readonly id: string;
  readonly kind: RuntimeStepKind;
  readonly title: string;
  readonly status: RuntimeStatus;
  readonly summary: string;
  readonly dependsOn: readonly string[];
  readonly command?: RuntimePlannedCommand;
  readonly optional?: boolean;
  readonly skippedReason?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
};

export type RuntimeResource = {
  readonly id: string;
  readonly kind: RuntimeResourceKind;
  readonly status: RuntimeStatus;
  readonly ownerSessionId?: string;
  readonly label?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
};

export type RuntimeCommandResult = {
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly status: RuntimeStatus;
  readonly exitCode?: number;
  readonly durationMs?: number;
  readonly stdoutExcerpt?: string;
  readonly stderrExcerpt?: string;
  readonly timedOut?: boolean;
};

export type RuntimeHealthCheckResult = {
  readonly id: string;
  readonly target: string;
  readonly status: RuntimeStatus;
  readonly elapsedMs?: number;
  readonly statusCode?: number;
  readonly outputExcerpt?: string;
};

export type BootstrapPlan = {
  readonly repositoryRoot: string;
  readonly contractPath?: string;
  readonly dryRun: boolean;
  readonly steps: readonly RuntimeStep[];
  readonly resources: readonly RuntimeResource[];
  readonly prerequisites: readonly RuntimePrerequisiteResult[];
  readonly warnings: readonly string[];
};

export type BootstrapSession = {
  readonly id: string;
  readonly repositoryRoot: string;
  readonly status: RuntimeStatus;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly steps: readonly RuntimeStep[];
  readonly resources: readonly RuntimeResource[];
  readonly commandResults: readonly RuntimeCommandResult[];
  readonly healthCheckResults: readonly RuntimeHealthCheckResult[];
  readonly budget?: RuntimeBudgetInput;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

export type RuntimeReport = {
  readonly ok: boolean;
  readonly status: RuntimeStatus;
  readonly summary: string;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly nextSteps: readonly string[];
};

export type RuntimeStatusReport = RuntimeReport & {
  readonly session?: BootstrapSession;
  readonly resources: readonly RuntimeResource[];
};

export type RuntimeStopReport = RuntimeReport & {
  readonly stoppedSessionIds: readonly string[];
  readonly stoppedResources: readonly RuntimeResource[];
};

export type BootstrapPlanInput = {
  readonly repositoryRoot: string;
  readonly contract?: RepositoryContract;
  readonly contractPath?: string;
  readonly dryRun?: boolean;
  readonly only?: string;
  readonly skipSetup?: boolean;
  readonly healthChecks?: boolean;
};

export type BootstrapPlanResult = RuntimeReport & {
  readonly plan: BootstrapPlan;
};

export type StartRuntimeInput = BootstrapPlanInput & {
  readonly timeoutSeconds?: number;
  readonly budget?: RuntimeBudgetInput;
  readonly sessionId?: string;
  readonly stateStore?: RuntimeStateStore;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly interruptSignal?: AbortSignal;
};

export type StartRuntimeResult = RuntimeReport & {
  readonly plan: BootstrapPlan;
  readonly session?: BootstrapSession;
};

export type RuntimeStatusInput = {
  readonly repositoryRoot: string;
  readonly sessionId?: string;
  readonly stateStore?: RuntimeStateStore;
};

export type RuntimeStatusResult = RuntimeStatusReport;

export type StopRuntimeInput = {
  readonly repositoryRoot: string;
  readonly sessionId?: string;
  readonly all?: boolean;
  readonly force?: boolean;
  readonly stateStore?: RuntimeStateStore;
  readonly stopCompose?: (input: {
    readonly repositoryRoot: string;
    readonly projectName: string;
    readonly down?: boolean;
  }) => Promise<RuntimeCommandResult>;
};

export type StopRuntimeResult = RuntimeStopReport;

export type ManagedProcessRecord = {
  readonly pid: number;
  readonly sessionId: string;
  readonly repositoryRoot: string;
  readonly resourceId: string;
  readonly applicationId?: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly startedAt: string;
  readonly stdoutExcerpt?: string;
  readonly stderrExcerpt?: string;
};

export type RuntimeReportCounts = {
  readonly total: number;
  readonly pending: number;
  readonly running: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly interrupted: number;
  readonly skipped: number;
  readonly timedOut: number;
  readonly stopped: number;
  readonly unknown: number;
};

export type RuntimeReportDetails = {
  readonly sessionId?: string;
  readonly status: RuntimeStatus;
  readonly steps: RuntimeReportCounts;
  readonly resources: RuntimeReportCounts;
  readonly healthChecks: RuntimeReportCounts;
  readonly services: readonly string[];
  readonly applications: readonly string[];
  readonly ports: readonly {
    readonly ownerId?: string;
    readonly host?: string;
    readonly port?: number;
    readonly status: RuntimeStatus;
  }[];
  readonly failedStepIds: readonly string[];
  readonly failedResourceIds: readonly string[];
  readonly durations: {
    readonly sessionMs?: number;
    readonly commandMs: number;
    readonly healthCheckMs: number;
  };
  readonly nextSteps: readonly string[];
};

export type RuntimeFormattedReport = {
  readonly summary: string;
  readonly human: string;
  readonly details: RuntimeReportDetails;
};
