import type { GraphSnapshot } from "./graph-store.js";
import type { GraphExplanation, GraphNode } from "./types.js";
import type { GraphUsageAggregation } from "./usage-evidence.js";

export function explainLegacyCandidate(input: {
  readonly snapshot: Pick<GraphSnapshot, "nodes" | "edges" | "evidence">;
  readonly candidateId: string;
  readonly usage?: GraphUsageAggregation;
}): GraphExplanation | undefined {
  const candidate = input.snapshot.nodes.find(
    (node) => node.id === input.candidateId && node.kind === "legacy_candidate"
  );
  if (!candidate) return undefined;
  const relationships = input.snapshot.edges.filter(
    (edge) =>
      edge.sourceNodeId === candidate.id &&
      ["candidate_for", "replaced_by", "has_counter_evidence"].includes(edge.kind)
  );
  const counterEdges =
    input.usage?.counterEvidenceEdges.filter((edge) => edge.sourceNodeId === candidate.id) ?? [];
  const allRelationships = [...relationships, ...counterEdges];
  const relatedNodes = allRelationships.flatMap((edge) =>
    input.snapshot.nodes.filter((node) => node.id === edge.targetNodeId)
  );
  const evidenceIds = [
    ...new Set([...candidate.evidenceIds, ...allRelationships.flatMap((edge) => edge.evidenceIds)])
  ];
  const evidence = [...input.snapshot.evidence, ...(input.usage?.evidence ?? [])].filter((entry) =>
    evidenceIds.includes(entry.id)
  );
  const status = stringMetadata(candidate, "status") ?? "unreviewed";
  const confidence = stringMetadata(candidate, "confidence") ?? "low";
  const signals = stringMetadata(candidate, "signalTypes") ?? "no named signals";
  const active = counterEdges.length > 0;
  const replacement =
    allRelationships.some((edge) => edge.kind === "replaced_by") ||
    Boolean(stringMetadata(candidate, "replacementHints"));
  const summary = `${candidate.label} is a ${confidence}-confidence legacy candidate based on ${signals}. ${active ? "Active-use counter-evidence is present; review before changing it." : "No active-use counter-evidence was found in this graph snapshot."}${replacement ? " A replacement is recorded." : ""}`;
  return {
    target: candidate,
    relatedNodes: uniqueNodes(relatedNodes),
    relationships: allRelationships,
    evidence,
    summary,
    warnings:
      status === "false_positive" || status === "resolved"
        ? [`Candidate status is ${status}.`]
        : ["This explanation does not imply safe deletion."]
  };
}
function stringMetadata(node: GraphNode, key: string): string | undefined {
  const value = node.metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function uniqueNodes(nodes: readonly GraphNode[]): readonly GraphNode[] {
  return [...new Map(nodes.map((node) => [node.id, node])).values()];
}
