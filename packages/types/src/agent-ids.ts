export type AgentRunId = string & { readonly __brand: "AgentRunId" };
export type ToolCallId = string & { readonly __brand: "ToolCallId" };
export type ProposalId = string & { readonly __brand: "ProposalId" };
export type ApprovalId = string & { readonly __brand: "ApprovalId" };

export type AgentTraceIds = {
  readonly agentRunId?: AgentRunId;
  readonly toolCallId?: ToolCallId;
  readonly proposalId?: ProposalId;
  readonly approvalId?: ApprovalId;
};
