import type { GraphStore } from "./graph-store.js";
import {
  repositoryGraphNodeKinds,
  type GraphNode,
  type GraphQueryResult,
  type RepositoryGraphNodeKind
} from "./types.js";

export type GraphQueryOptions = {
  readonly target: string;
  readonly kinds?: readonly RepositoryGraphNodeKind[];
  readonly depth?: number;
  readonly limit?: number;
};
export async function findGraphNodes(
  store: GraphStore,
  target: string,
  kinds: readonly RepositoryGraphNodeKind[] = repositoryGraphNodeKinds
): Promise<readonly GraphNode[]> {
  const nodes = await Promise.all(kinds.map((kind) => store.getNodesByKind(kind)));
  const normalized = target.toLowerCase();
  return nodes
    .flat()
    .filter(
      (node) =>
        node.id === target ||
        node.key === target ||
        node.path === target ||
        node.label.toLowerCase() === normalized
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}
export async function queryGraphRelationships(
  store: GraphStore,
  input: GraphQueryOptions
): Promise<GraphQueryResult> {
  const starts = await findGraphNodes(store, input.target, input.kinds);
  if (starts.length === 0)
    return {
      nodes: [],
      edges: [],
      evidence: [],
      warnings: [`Graph target not found: ${input.target}.`]
    };
  const traversals = await Promise.all(
    starts.slice(0, input.limit ?? 25).map((node) =>
      store.traverse({
        startNodeId: node.id,
        direction: "both",
        maxDepth: Math.min(input.depth ?? 1, 6)
      })
    )
  );
  const nodes = [
    ...new Map(
      [...starts, ...traversals.flatMap((value) => value.nodes)].map((node) => [node.id, node])
    ).values()
  ].slice(0, input.limit ?? 100);
  const edges = [
    ...new Map(traversals.flatMap((value) => value.edges).map((edge) => [edge.id, edge])).values()
  ].slice(0, input.limit ?? 100);
  const evidence = await store.getEvidence([
    ...new Set([
      ...nodes.flatMap((node) => node.evidenceIds),
      ...edges.flatMap((edge) => edge.evidenceIds)
    ])
  ]);
  return { nodes, edges, evidence, warnings: [] };
}
export async function queryRelatedTests(
  store: GraphStore,
  target: string
): Promise<GraphQueryResult> {
  return filterNodes(await queryGraphRelationships(store, { target, depth: 1 }), new Set(["test"]));
}
export async function queryRelatedDocs(
  store: GraphStore,
  target: string
): Promise<GraphQueryResult> {
  return filterNodes(
    await queryGraphRelationships(store, { target, depth: 1 }),
    new Set(["document", "agent_instruction"])
  );
}
export async function queryRelatedCommands(
  store: GraphStore,
  target: string
): Promise<GraphQueryResult> {
  return filterNodes(
    await queryGraphRelationships(store, { target, depth: 1 }),
    new Set(["command", "verification_check", "ci_job"])
  );
}
export async function queryUnsafeGraphStatus(
  store: GraphStore,
  target: string
): Promise<GraphQueryResult> {
  const result = await queryGraphRelationships(store, { target, depth: 1 });
  const unsafe = result.edges.filter(
    (edge) => edge.kind === "unsafe_to_edit" || edge.kind === "generates"
  );
  return {
    ...result,
    edges: unsafe,
    warnings:
      unsafe.length === 0
        ? [...result.warnings, "No generated or unsafe relationship found."]
        : result.warnings
  };
}
export async function queryUsageEvidence(
  store: GraphStore,
  target: string
): Promise<GraphQueryResult> {
  const result = await queryGraphRelationships(store, { target, depth: 1 });
  return {
    ...result,
    edges: result.edges.filter((edge) =>
      [
        "imports",
        "tests",
        "handles_route",
        "runs",
        "verifies",
        "references",
        "documents",
        "has_counter_evidence"
      ].includes(edge.kind)
    )
  };
}
export async function queryLegacyCandidates(
  store: GraphStore,
  target?: string
): Promise<GraphQueryResult> {
  if (!target) {
    const nodes = await store.getNodesByKind("legacy_candidate");
    return {
      nodes,
      edges: [],
      evidence: await store.getEvidence(nodes.flatMap((node) => node.evidenceIds)),
      warnings: []
    };
  }
  return filterNodes(
    await queryGraphRelationships(store, { target, depth: 1 }),
    new Set(["legacy_candidate"])
  );
}
function filterNodes(
  result: GraphQueryResult,
  kinds: ReadonlySet<RepositoryGraphNodeKind>
): GraphQueryResult {
  const nodes = result.nodes.filter((node) => kinds.has(node.kind));
  const ids = new Set(nodes.map((node) => node.id));
  return {
    ...result,
    nodes,
    edges: result.edges.filter((edge) => ids.has(edge.sourceNodeId) || ids.has(edge.targetNodeId))
  };
}
