export const verificationStatuses = [
  "passed",
  "failed",
  "timed_out",
  "skipped",
  "blocked",
  "not_configured",
  "unknown"
] as const;

export type VerificationStatus = (typeof verificationStatuses)[number];

export const verificationSelectionModes = ["git", "all", "paths", "components", "checks"] as const;

export type VerificationSelectionMode = (typeof verificationSelectionModes)[number];

export type VerificationChangeSet = {
  readonly mode: VerificationSelectionMode;
  readonly baseRef?: string;
  readonly headRef?: string;
  readonly paths: readonly string[];
  readonly changedPaths: readonly string[];
  readonly warnings: readonly string[];
};

export type VerificationCheckSource = "default" | "rule-check" | "rule-command";

export type VerificationCheckSelectionReason = {
  readonly kind: "default" | "path" | "component" | "explicit" | "rule";
  readonly details: readonly string[];
};

export type VerificationCheckSkipReason =
  "not-configured" | "blocked" | "skipped-by-user" | "duplicate" | "dependency" | "dry-run";

export type VerificationCheck = {
  readonly id: string;
  readonly source: VerificationCheckSource;
  readonly ruleId?: string;
  readonly commandId?: string;
  readonly description?: string;
  readonly command: {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd?: string;
    readonly shell?: boolean;
    readonly timeoutSeconds?: number;
    readonly environment?: readonly string[];
    readonly optional?: boolean;
  };
  readonly paths: readonly string[];
  readonly components: readonly string[];
  readonly requires: readonly string[];
  readonly reason: VerificationCheckSelectionReason;
};

export type SelectedVerificationCheck = VerificationCheck & {
  readonly selected: true;
};

export type VerificationCheckResultStatus = VerificationStatus | "pending";

export type VerificationCheckResult = {
  readonly id: string;
  readonly status: VerificationCheckResultStatus;
  readonly source: VerificationCheckSource;
  readonly command?: VerificationCheck["command"];
  readonly selectedBy?: VerificationCheckSelectionReason;
  readonly skipReason?: VerificationCheckSkipReason;
  readonly exitCode?: number;
  readonly timedOut?: boolean;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly stdoutExcerpt?: string;
  readonly stderrExcerpt?: string;
  readonly stdoutTruncated?: boolean;
  readonly stderrTruncated?: boolean;
  readonly evidence: readonly string[];
};

export type VerificationPlan = {
  readonly mode: VerificationSelectionMode;
  readonly contractPath?: string;
  readonly baseRef?: string;
  readonly headRef?: string;
  readonly changeSet: VerificationChangeSet;
  readonly selectedChecks: readonly SelectedVerificationCheck[];
  readonly skippedChecks: readonly VerificationCheckResult[];
  readonly warnings: readonly string[];
};

export type VerificationSummary = {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly timedOut: number;
  readonly skipped: number;
  readonly blocked: number;
  readonly notConfigured: number;
  readonly unknown: number;
};

export type VerificationRun = {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly repositoryRoot: string;
  readonly contractPath?: string;
  readonly contractVersion?: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly status: VerificationStatus;
  readonly changeSet: VerificationChangeSet;
  readonly plan: VerificationPlan;
  readonly results: readonly VerificationCheckResult[];
  readonly summary: VerificationSummary;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

export type VerificationHistoryEntry = {
  readonly runId: string;
  readonly status: VerificationStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly contractPath?: string;
  readonly summary: VerificationSummary;
};

export type VerificationHistory = {
  readonly schemaVersion: 1;
  readonly latestRunId?: string;
  readonly runs: readonly VerificationHistoryEntry[];
};

export type VerificationRuntimePackage = {
  readonly name: "@repo-knowledge/verification-runtime";
  readonly owns: "local-verification-runtime";
  readonly phase: "phase-6-verification-runtime";
};

export type VerificationLoaderResult = {
  readonly contract?: unknown;
  readonly contractPath?: string;
  readonly contractVersion?: string;
  readonly verification: {
    readonly default: readonly unknown[];
    readonly rules: readonly unknown[];
  };
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};
