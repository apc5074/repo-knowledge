import type {
  VerificationCheckResult,
  VerificationPlan,
  VerificationRun,
  VerificationSummary
} from "./types.js";

export type VerificationFormattedReport = {
  readonly summary: string;
  readonly human: string;
  readonly details: VerificationReportDetails;
};

export type VerificationReportDetails = {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly repositoryRoot: string;
  readonly contractPath?: string;
  readonly contractVersion?: string;
  readonly status: VerificationRun["status"];
  readonly changeSet: VerificationPlan["changeSet"];
  readonly summary: VerificationSummary;
  readonly selectedChecks: readonly VerificationSelectedCheckReport[];
  readonly skippedChecks: readonly VerificationCheckResult[];
  readonly results: readonly VerificationCheckResult[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly historyPath?: string;
};

export type VerificationSelectedCheckReport = {
  readonly id: string;
  readonly source: VerificationCheckResult["source"];
  readonly command?: VerificationCheckResult["command"];
  readonly selectedBy?: VerificationCheckResult["selectedBy"];
  readonly status: VerificationCheckResult["status"];
};

export function formatVerificationRunReport(run: VerificationRun): VerificationFormattedReport {
  const details = buildVerificationReportDetails(run);
  const summary =
    run.status === "failed"
      ? `Verification failed for ${run.runId}.`
      : run.status === "blocked"
        ? `Verification blocked for ${run.runId}.`
        : run.status === "not_configured"
          ? `Verification has no configured checks for ${run.runId}.`
          : run.status === "skipped"
            ? `Verification dry run for ${run.runId}.`
            : `Verification passed for ${run.runId}.`;

  return {
    summary,
    human: buildHumanVerificationReport(summary, details),
    details
  };
}

export function buildVerificationReportDetails(run: VerificationRun): VerificationReportDetails {
  return {
    schemaVersion: run.schemaVersion,
    runId: run.runId,
    repositoryRoot: run.repositoryRoot,
    contractPath: run.contractPath,
    contractVersion: run.contractVersion,
    status: run.status,
    changeSet: run.changeSet,
    summary: run.summary,
    selectedChecks: run.plan.selectedChecks.map((check) => ({
      ...check,
      command: check.command,
      status: run.results.find((result) => result.id === check.id)?.status ?? "skipped"
    })),
    skippedChecks: run.plan.skippedChecks,
    results: run.results,
    warnings: run.warnings,
    errors: run.errors,
    historyPath: undefined
  };
}

function buildHumanVerificationReport(summary: string, details: VerificationReportDetails): string {
  const lines = [summary];

  if (details.changeSet.changedPaths.length > 0) {
    lines.push("Changed paths:");
    for (const path of details.changeSet.changedPaths) {
      lines.push(`  ${path}`);
    }
  }

  if (details.selectedChecks.length > 0) {
    lines.push("Checks:");
    for (const check of details.selectedChecks) {
      lines.push(`  ${check.status.padEnd(10)} ${check.id} ${check.command?.command ?? "unknown"}`);
    }
  }

  if (details.skippedChecks.length > 0) {
    lines.push("Skipped:");
    for (const check of details.skippedChecks) {
      lines.push(`  ${check.id} ${check.skipReason ?? "skipped"}`);
    }
  }

  if (details.errors.length > 0) {
    lines.push("Errors:");
    for (const error of details.errors) {
      lines.push(`  ${error}`);
    }
  }

  return lines.join("\n");
}
