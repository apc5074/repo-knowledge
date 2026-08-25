import type { GraphStore } from "./graph-store.js";
import { explainLegacyCandidate } from "./legacy-explanations.js";
import { queryGraphRelationships } from "./queries.js";
import { aggregateUsageEvidence } from "./usage-evidence.js";
import type { GraphExplanation, GraphNode } from "./types.js";

const supportedKinds = new Set<GraphNode["kind"]>([
  "file",
  "symbol",
  "route",
  "component",
  "command",
  "legacy_candidate"
]);
export type GraphExplanationResult =
  | { readonly ok: true; readonly explanation: GraphExplanation }
  | {
      readonly ok: false;
      readonly error: "not_found" | "unsupported_target";
      readonly message: string;
    };

export async function explainGraphTarget(
  store: GraphStore,
  target: string
): Promise<GraphExplanationResult> {
  const related = await queryGraphRelationships(store, { target, depth: 2, limit: 100 });
  const node =
    related.nodes.find(
      (item) => item.id === target || item.key === target || item.path === target
    ) ?? related.nodes.find((item) => item.label === target);
  if (!node)
    return { ok: false, error: "not_found", message: `Graph target not found: ${target}.` };
  if (!supportedKinds.has(node.kind))
    return {
      ok: false,
      error: "unsupported_target",
      message: `Graph explanations do not support ${node.kind} targets.`
    };
  if (node.kind === "legacy_candidate") {
    const explanation = explainLegacyCandidate({
      snapshot: { nodes: related.nodes, edges: related.edges, evidence: related.evidence },
      candidateId: node.id,
      usage: aggregateUsageEvidence({
        nodes: related.nodes,
        edges: related.edges,
        evidence: related.evidence
      })
    });
    return explanation
      ? { ok: true, explanation }
      : { ok: false, error: "not_found", message: `Legacy candidate not found: ${target}.` };
  }
  const relationships = related.edges.filter(
    (edge) => edge.sourceNodeId === node.id || edge.targetNodeId === node.id
  );
  const relatedNodes = related.nodes.filter((item) => item.id !== node.id);
  const summary = `${kindLabel(node.kind)} ${node.label} has ${relationships.length} direct or nearby graph relationship${relationships.length === 1 ? "" : "s"}.`;
  return {
    ok: true,
    explanation: {
      target: node,
      relatedNodes,
      relationships,
      evidence: related.evidence,
      summary,
      warnings: related.warnings
    }
  };
}
function kindLabel(kind: GraphNode["kind"]): string {
  return kind.replaceAll("_", " ");
}
