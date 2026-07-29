import { typesPackage } from "@repo-knowledge/types";

export const agentMemoryPackage = {
  name: "@repo-knowledge/agent-memory",
  owns: "agent-memory-boundaries",
  phase: typesPackage.phase
} as const;

export const plannedMemoryKinds = [
  "repository-fact",
  "agent-run-summary",
  "known-problem",
  "artifact-proposal-history",
  "approval-decision",
  "retrieval-embedding"
] as const;

export type PlannedMemoryKind = (typeof plannedMemoryKinds)[number];

export const agentMemoryBoundary = {
  owns: ["memory record shapes", "retention boundaries", "retrieval metadata"],
  doesNotOwn: ["secret values", "raw local logs by default", "private shell history"]
} as const;
