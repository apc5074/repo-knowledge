import { typesPackage } from "@repo-knowledge/types";

export const agentToolsPackage = {
  name: "@repo-knowledge/agent-tools",
  owns: "policy-checked-tool-boundaries",
  phase: typesPackage.phase
} as const;

export const plannedToolCategories = [
  "repository-scanning",
  "contract-validation",
  "artifact-proposal",
  "diff-generation",
  "approved-command-execution",
  "retrieval",
  "github-integration",
  "human-approval-request"
] as const;

export type PlannedToolCategory = (typeof plannedToolCategories)[number];

export const agentToolsBoundary = {
  owns: ["tool schemas", "tool-call records", "policy checks before execution"],
  doesNotOwn: ["agent planning", "model routing", "human approval decisions"]
} as const;
