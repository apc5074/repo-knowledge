import type { VerificationPlan } from "./types.js";

export type VerificationDryRunReport = {
  readonly plan: VerificationPlan;
  readonly summary: string;
  readonly human: string;
};

export function createVerificationDryRunReport(plan: VerificationPlan): VerificationDryRunReport {
  const summary =
    plan.selectedChecks.length === 0
      ? "No verification checks selected."
      : `Selected ${plan.selectedChecks.length} verification checks.`;

  return {
    plan,
    summary,
    human: [
      summary,
      `Mode: ${plan.mode}`,
      `Selected checks: ${plan.selectedChecks.map((check) => check.id).join(", ") || "none"}`,
      `Skipped checks: ${plan.skippedChecks.map((check) => check.id).join(", ") || "none"}`
    ].join("\n")
  };
}
