import type { GraphEdge, GraphEvidence, GraphExplanation, GraphNode } from "./types.js";
import type {
  GraphNeighborDirection,
  GraphNeighborQuery,
  GraphPathQuery,
  GraphPathResult,
  GraphRelationshipExplanationQuery,
  GraphSnapshot,
  GraphStore,
  GraphTraversalQuery,
  GraphTraversalResult
} from "./graph-store.js";

export function createJsonFixtureGraphStore(initial?: Partial<GraphSnapshot>): GraphStore {
  let build = initial?.build;
  let nodes = new Map((initial?.nodes ?? []).map((node) => [node.id, node]));
  let edges = new Map((initial?.edges ?? []).map((edge) => [edge.id, edge]));
  let evidence = new Map((initial?.evidence ?? []).map((entry) => [entry.id, entry]));

  return {
    ensure: async () => {},
    clear: async () => {
      build = undefined;
      nodes = new Map();
      edges = new Map();
      evidence = new Map();
    },
    replaceGraph: async (snapshot) => {
      build = snapshot.build;
      nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
      edges = new Map(snapshot.edges.map((edge) => [edge.id, edge]));
      evidence = new Map(snapshot.evidence.map((entry) => [entry.id, entry]));
      return snapshot;
    },
    getBuild: async (buildId) => (build?.id === buildId ? build : undefined),
    getLatestBuild: async () => build,
    getNode: async (nodeId) => nodes.get(nodeId),
    getNodesByKind: async (kind) =>
      [...nodes.values()].filter((node) => node.kind === kind).sort(compareNodes),
    getNeighbors: async (query) => neighborsFromMaps(query, nodes, edges),
    traverse: async (query) => traverseFromMaps(query, nodes, edges),
    findPath: async (query) => findPathFromMaps(query, nodes, edges),
    getEvidence: async (evidenceIds) =>
      evidenceIds
        .flatMap((id) => {
          const entry = evidence.get(id);
          return entry === undefined ? [] : [entry];
        })
        .sort((left, right) => left.id.localeCompare(right.id)),
    explainRelationship: async (query) => explainRelationshipFromMaps(query, nodes, edges, evidence)
  };
}

function neighborsFromMaps(
  query: GraphNeighborQuery,
  nodes: ReadonlyMap<string, GraphNode>,
  edges: ReadonlyMap<string, GraphEdge>
): readonly GraphNode[] {
  const direction = query.direction ?? "both";
  const edgeKinds = new Set(query.edgeKinds ?? []);
  const matches = [...edges.values()].filter((edge) => {
    if (edgeKinds.size > 0 && !edgeKinds.has(edge.kind)) {
      return false;
    }

    return matchesDirection(edge, query.nodeId, direction);
  });
  const nodeIds = new Set<string>();

  for (const edge of matches) {
    if (edge.sourceNodeId === query.nodeId) {
      nodeIds.add(edge.targetNodeId);
    }
    if (edge.targetNodeId === query.nodeId) {
      nodeIds.add(edge.sourceNodeId);
    }
  }

  return [...nodeIds]
    .flatMap((id) => {
      const node = nodes.get(id);
      return node === undefined ? [] : [node];
    })
    .sort(compareNodes);
}

function traverseFromMaps(
  query: GraphTraversalQuery,
  nodes: ReadonlyMap<string, GraphNode>,
  edges: ReadonlyMap<string, GraphEdge>
): GraphTraversalResult {
  const maxDepth = query.maxDepth ?? 3;
  const visitedNodes = new Set<string>([query.startNodeId]);
  const visitedEdges = new Set<string>();
  const queue = [{ nodeId: query.startNodeId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === undefined || current.depth >= maxDepth) {
      continue;
    }

    for (const edge of edges.values()) {
      if ((query.edgeKinds?.length ?? 0) > 0 && !(query.edgeKinds ?? []).includes(edge.kind)) {
        continue;
      }
      if (!matchesDirection(edge, current.nodeId, query.direction ?? "both")) {
        continue;
      }

      const nextNodeId =
        edge.sourceNodeId === current.nodeId ? edge.targetNodeId : edge.sourceNodeId;
      visitedEdges.add(edge.id);

      if (!visitedNodes.has(nextNodeId)) {
        visitedNodes.add(nextNodeId);
        queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
      }
    }
  }

  return {
    nodes: [...visitedNodes]
      .flatMap((id) => {
        const node = nodes.get(id);
        return node === undefined ? [] : [node];
      })
      .sort(compareNodes),
    edges: [...visitedEdges]
      .flatMap((id) => {
        const edge = edges.get(id);
        return edge === undefined ? [] : [edge];
      })
      .sort(compareEdges)
  };
}

function findPathFromMaps(
  query: GraphPathQuery,
  nodes: ReadonlyMap<string, GraphNode>,
  edges: ReadonlyMap<string, GraphEdge>
): GraphPathResult | undefined {
  const maxDepth = query.maxDepth ?? 6;
  const queue: Array<{
    readonly nodeId: string;
    readonly depth: number;
    readonly pathNodeIds: readonly string[];
    readonly pathEdgeIds: readonly string[];
  }> = [
    {
      nodeId: query.sourceNodeId,
      depth: 0,
      pathNodeIds: [query.sourceNodeId],
      pathEdgeIds: []
    }
  ];
  const seen = new Set<string>([query.sourceNodeId]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === undefined || current.depth > maxDepth) {
      continue;
    }
    if (current.nodeId === query.targetNodeId) {
      return {
        nodes: current.pathNodeIds
          .flatMap((id) => {
            const node = nodes.get(id);
            return node === undefined ? [] : [node];
          })
          .sort(compareNodes),
        edges: current.pathEdgeIds
          .flatMap((id) => {
            const edge = edges.get(id);
            return edge === undefined ? [] : [edge];
          })
          .sort(compareEdges)
      };
    }

    for (const edge of edges.values()) {
      if ((query.edgeKinds?.length ?? 0) > 0 && !(query.edgeKinds ?? []).includes(edge.kind)) {
        continue;
      }
      if (!matchesDirection(edge, current.nodeId, query.direction ?? "both")) {
        continue;
      }

      const nextNodeId =
        edge.sourceNodeId === current.nodeId ? edge.targetNodeId : edge.sourceNodeId;

      if (seen.has(nextNodeId)) {
        continue;
      }

      seen.add(nextNodeId);
      queue.push({
        nodeId: nextNodeId,
        depth: current.depth + 1,
        pathNodeIds: [...current.pathNodeIds, nextNodeId],
        pathEdgeIds: [...current.pathEdgeIds, edge.id]
      });
    }
  }

  return undefined;
}

function explainRelationshipFromMaps(
  query: GraphRelationshipExplanationQuery,
  nodes: ReadonlyMap<string, GraphNode>,
  edges: ReadonlyMap<string, GraphEdge>,
  evidence: ReadonlyMap<string, GraphEvidence>
): GraphExplanation | undefined {
  const source = nodes.get(query.sourceNodeId);
  const target = nodes.get(query.targetNodeId);

  if (source === undefined || target === undefined) {
    return undefined;
  }

  const relationships = [...edges.values()].filter(
    (edge) =>
      edge.sourceNodeId === query.sourceNodeId &&
      edge.targetNodeId === query.targetNodeId &&
      (query.kind === undefined || edge.kind === query.kind)
  );

  if (relationships.length === 0) {
    return undefined;
  }

  const explanationEvidence = [...new Set(relationships.flatMap((edge) => edge.evidenceIds))]
    .flatMap((id) => {
      const entry = evidence.get(id);
      return entry === undefined ? [] : [entry];
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    target: source,
    relatedNodes: [target],
    relationships: relationships.sort(compareEdges),
    evidence: explanationEvidence,
    summary: `${source.label} -> ${target.label}`,
    warnings: []
  };
}

function matchesDirection(
  edge: GraphEdge,
  nodeId: string,
  direction: GraphNeighborDirection
): boolean {
  if (direction === "outgoing") {
    return edge.sourceNodeId === nodeId;
  }
  if (direction === "incoming") {
    return edge.targetNodeId === nodeId;
  }

  return edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId;
}

function compareNodes(left: GraphNode, right: GraphNode): number {
  return left.id.localeCompare(right.id);
}

function compareEdges(left: GraphEdge, right: GraphEdge): number {
  return left.id.localeCompare(right.id);
}
