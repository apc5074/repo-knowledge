import type { AgentRunId, ApprovalId, ProposalId } from "./agent-ids.js";

export type ApprovalPlaceholder = {
  readonly kind: "approval";
  readonly id: ApprovalId;
  readonly agentRunId?: AgentRunId;
  readonly proposalId?: ProposalId;
  readonly status: "requested" | "approved" | "rejected" | "expired";
};
