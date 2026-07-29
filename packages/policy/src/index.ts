import { typesPackage } from "@repo-knowledge/types";

export const policyPackage = {
  name: "@repo-knowledge/policy",
  owns: "agent-policy-decisions",
  phase: typesPackage.phase
} as const;

export const plannedPolicyDomains = [
  "filesystem",
  "shell-command",
  "network",
  "secrets",
  "model-call",
  "github-write",
  "artifact-approval"
] as const;

export type PlannedPolicyDomain = (typeof plannedPolicyDomains)[number];

export const policyBoundary = {
  owns: ["policy definitions", "policy decision records", "safety classifications"],
  doesNotOwn: ["tool implementation", "agent workflow routing", "model prompts"]
} as const;
