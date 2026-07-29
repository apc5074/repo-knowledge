import type { AgentRunId } from "./agent-ids.js";
import type { EvidenceReference } from "./evidence.js";

export type AgentMemoryPlaceholder = {
  readonly kind: "agent-memory";
  readonly agentRunId?: AgentRunId;
  readonly memoryKind: "decision" | "known-problem" | "repository-note" | "retrieval-hint";
  readonly evidence?: readonly EvidenceReference[];
};
