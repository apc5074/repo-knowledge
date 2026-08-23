import type { VerificationCheckResult, VerificationRun, VerificationStatus } from "./types.js";

export type VerificationStatusClassification = {
  readonly status: VerificationStatus;
  readonly exitCode: number;
};

export function classifyVerificationRunStatus(
  results: readonly VerificationCheckResult[],
  dryRun = false
): VerificationStatusClassification {
  if (dryRun) {
    return { status: "skipped", exitCode: 0 };
  }

  if (results.length === 0) {
    return { status: "not_configured", exitCode: 0 };
  }

  if (results.some((result) => result.status === "failed" || result.status === "timed_out")) {
    return { status: "failed", exitCode: 1 };
  }

  if (results.some((result) => result.status === "blocked")) {
    return { status: "blocked", exitCode: 0 };
  }

  if (results.every((result) => result.status === "skipped")) {
    return { status: "skipped", exitCode: 0 };
  }

  if (results.every((result) => result.status === "not_configured")) {
    return { status: "not_configured", exitCode: 0 };
  }

  return { status: "passed", exitCode: 0 };
}

export function summarizeVerificationRun(run: VerificationRun, dryRun = false): VerificationRun {
  const classification = classifyVerificationRunStatus(run.results, dryRun);

  return {
    ...run,
    status: classification.status
  };
}
