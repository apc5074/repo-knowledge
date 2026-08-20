import { typesPackage } from "@repo-knowledge/types";

import { createBootstrapPlan } from "./plan.js";
import type { BootstrapPlanInput, BootstrapPlanResult } from "./types.js";

export const bootstrapRuntimePackage = {
  name: "@repo-knowledge/bootstrap-runtime",
  owns: "local-bootstrap-runtime",
  phase: typesPackage.phase
} as const;

export * from "./runtime.js";
export * from "./runtime-budget.js";
export * from "./command-runner.js";
export * from "./contract-loader.js";
export * from "./command-redaction.js";
export * from "./compose.js";
export * from "./devcontainer.js";
export * from "./environment.js";
export * from "./health-checks.js";
export * from "./orchestrator.js";
export * from "./plan.js";
export * from "./ports.js";
export * from "./process-manager.js";
export * from "./prerequisites.js";
export * from "./reports.js";
export * from "./setup-runner.js";
export * from "./state-machine.js";
export * from "./state-store.js";
export * from "./status.js";
export * from "./stop.js";
export * from "./tools.js";
export * from "./types.js";

export function buildBootstrapPlan(input: BootstrapPlanInput): BootstrapPlanResult {
  const plan = createBootstrapPlan(input);
  const hasContract = input.contract !== undefined;

  return {
    ok: true,
    status: "pending",
    summary: hasContract
      ? "Built bootstrap runtime plan from repository contract."
      : "Built bootstrap runtime plan skeleton.",
    warnings: plan.warnings,
    errors: [],
    nextSteps: hasContract
      ? ["Run board start --dry-run to inspect the planned local bootstrap steps."]
      : ["Load a repository contract before executing the runtime plan."],
    plan
  };
}
