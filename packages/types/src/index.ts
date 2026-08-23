export type { AgentTraceIds, AgentRunId, ApprovalId, ProposalId, ToolCallId } from "./agent-ids.js";
export type {
  AgentProposalPlaceholder,
  AgentRunPlaceholder,
  AgentToolCallPlaceholder
} from "./agent-runs.js";
export type { AgentMemoryPlaceholder } from "./agent-memory.js";
export type { ApprovalPlaceholder } from "./approvals.js";
export type { CheckResultPlaceholder } from "./checks.js";
export type { CommandResultPlaceholder } from "./command-results.js";
export type { EvidenceReference } from "./evidence.js";
export type { McpToolContractPlaceholder } from "./mcp-tools.js";
export type { PolicyDecisionPlaceholder } from "./policy.js";
export type { RepositoryContractRecord } from "./repository-contracts.js";
export type { ScannerFactPlaceholder } from "./scanner-facts.js";

export const typesPackage = {
  name: "@repo-knowledge/types",
  phase: "phase-0-placeholder",
  status: "shared-types"
} as const;

export type PackageIdentity = typeof typesPackage;
