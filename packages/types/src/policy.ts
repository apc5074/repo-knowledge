import type { AgentRunId, ToolCallId } from "./agent-ids.js";

export type PolicyDecisionPlaceholder = {
  readonly kind: "policy-decision";
  readonly agentRunId?: AgentRunId;
  readonly toolCallId?: ToolCallId;
  readonly decision: "allowed" | "denied" | "approval-required";
  readonly reason: string;
};
