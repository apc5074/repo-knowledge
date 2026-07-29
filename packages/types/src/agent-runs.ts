import type { AgentRunId, ApprovalId, ProposalId, ToolCallId } from "./agent-ids.js";

export type AgentRunPlaceholder = {
  readonly kind: "agent-run";
  readonly id: AgentRunId;
  readonly agentName: string;
  readonly status: "planned" | "running" | "waiting-for-approval" | "completed" | "failed";
};

export type AgentToolCallPlaceholder = {
  readonly kind: "agent-tool-call";
  readonly id: ToolCallId;
  readonly agentRunId?: AgentRunId;
  readonly toolName: string;
  readonly policyDecision: "allowed" | "denied" | "approval-required" | "not-evaluated";
};

export type AgentProposalPlaceholder = {
  readonly kind: "agent-proposal";
  readonly id: ProposalId;
  readonly agentRunId?: AgentRunId;
  readonly approvalId?: ApprovalId;
  readonly status: "proposed" | "approval-required" | "approved" | "rejected" | "applied";
};
