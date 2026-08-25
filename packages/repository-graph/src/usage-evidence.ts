import type { GraphSnapshot } from "./graph-store.js";
import {
  stableGraphEdgeId,
  stableGraphEvidenceId,
  type GraphEdge,
  type GraphEvidence
} from "./types.js";

export type GraphUsageSignal = {
  readonly targetNodeId: string;
  readonly kind:
    | "import"
    | "public_export"
    | "route"
    | "test"
    | "command"
    | "verification"
    | "ci"
    | "documentation";
  readonly edgeId: string;
  readonly confidence: GraphEdge["confidence"];
};
export type GraphUsageAggregation = {
  readonly signals: readonly GraphUsageSignal[];
  readonly evidence: readonly GraphEvidence[];
  readonly counterEvidenceEdges: readonly GraphEdge[];
};

export function aggregateUsageEvidence(
  snapshot: Pick<GraphSnapshot, "nodes" | "edges" | "evidence">
): GraphUsageAggregation {
  const signals = snapshot.edges.flatMap((edge): readonly GraphUsageSignal[] => {
    const kind = signalKind(edge.kind);
    return kind
      ? [{ targetNodeId: edge.targetNodeId, kind, edgeId: edge.id, confidence: edge.confidence }]
      : [];
  });
  const evidence: GraphEvidence[] = [];
  const counterEvidenceEdges: GraphEdge[] = [];
  for (const candidateEdge of snapshot.edges.filter((edge) => edge.kind === "candidate_for")) {
    const relevant = signals.filter((signal) => signal.targetNodeId === candidateEdge.targetNodeId);
    for (const signal of relevant) {
      const entry: GraphEvidence = {
        id: stableGraphEvidenceId({
          kind: "local_state",
          summary: `Active ${signal.kind} evidence`,
          doctorRecordId: candidateEdge.sourceNodeId
        }),
        kind: "local_state",
        summary: `Active ${signal.kind} evidence`,
        metadata: { signalKind: signal.kind, relationshipId: signal.edgeId }
      };
      evidence.push(entry);
      const id = stableGraphEdgeId({
        sourceNodeId: candidateEdge.sourceNodeId,
        targetNodeId: candidateEdge.targetNodeId,
        kind: "has_counter_evidence",
        extractorId: "usage-evidence"
      });
      counterEvidenceEdges.push({
        id,
        sourceNodeId: candidateEdge.sourceNodeId,
        targetNodeId: candidateEdge.targetNodeId,
        kind: "has_counter_evidence",
        confidence: signal.confidence,
        evidenceIds: [entry.id],
        extractorId: "usage-evidence",
        firstObservedBuildId: candidateEdge.firstObservedBuildId,
        lastObservedBuildId: candidateEdge.lastObservedBuildId
      });
    }
  }
  return {
    signals,
    evidence: dedupeEvidence(evidence),
    counterEvidenceEdges: dedupeEdges(counterEvidenceEdges)
  };
}
function signalKind(kind: GraphEdge["kind"]): GraphUsageSignal["kind"] | undefined {
  if (kind === "imports") return "import";
  if (kind === "exports") return "public_export";
  if (kind === "handles_route") return "route";
  if (kind === "tests") return "test";
  if (kind === "runs") return "command";
  if (kind === "verifies") return "verification";
  if (kind === "references") return "ci";
  if (kind === "documents") return "documentation";
  return undefined;
}
function dedupeEvidence(values: readonly GraphEvidence[]): readonly GraphEvidence[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}
function dedupeEdges(values: readonly GraphEdge[]): readonly GraphEdge[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}
