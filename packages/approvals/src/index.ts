import { typesPackage } from "@repo-knowledge/types";

export const approvalsPackage = {
  name: "@repo-knowledge/approvals",
  owns: "human-approval-boundaries",
  phase: typesPackage.phase
} as const;

export const approvalRequiredActions = [
  "apply-contract-update",
  "apply-documentation-update",
  "apply-setup-script-update",
  "apply-validation-rule-update",
  "open-maintenance-pr",
  "run-hosted-repository-command"
] as const;

export type ApprovalRequiredAction = (typeof approvalRequiredActions)[number];

export const approvalsBoundary = {
  owns: ["approval request shapes", "approval decision states", "proposal application gates"],
  doesNotOwn: ["artifact generation", "policy classification", "GitHub API execution"]
} as const;
