import { join } from "node:path";

import type { GraphBuild, GraphEdge, GraphEvidence, GraphExplanation, GraphNode } from "./types.js";

export type RepositoryGraphStorePaths = {
  readonly graphRoot: string;
  readonly sqlitePath: string;
  readonly metadataPath: string;
  readonly latestBuildPath: string;
  readonly snapshotsRoot: string;
};

export type GraphNeighborDirection = "outgoing" | "incoming" | "both";

export type GraphNeighborQuery = {
  readonly nodeId: string;
  readonly edgeKinds?: readonly string[];
  readonly direction?: GraphNeighborDirection;
};

export type GraphTraversalQuery = {
  readonly startNodeId: string;
  readonly edgeKinds?: readonly string[];
  readonly direction?: GraphNeighborDirection;
  readonly maxDepth?: number;
};

export type GraphPathQuery = {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly edgeKinds?: readonly string[];
  readonly direction?: GraphNeighborDirection;
  readonly maxDepth?: number;
};

export type GraphRelationshipExplanationQuery = {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly kind?: string;
};

export type GraphSnapshot = {
  readonly build: GraphBuild;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly evidence: readonly GraphEvidence[];
};

export type GraphTraversalResult = {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
};

export type GraphPathResult = {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
};

export type GraphStore = {
  readonly paths?: RepositoryGraphStorePaths;
  readonly ensure: () => Promise<void>;
  readonly clear: () => Promise<void>;
  readonly replaceGraph: (snapshot: GraphSnapshot) => Promise<GraphSnapshot>;
  readonly getBuild: (buildId: string) => Promise<GraphBuild | undefined>;
  readonly getLatestBuild: () => Promise<GraphBuild | undefined>;
  readonly getNode: (nodeId: string) => Promise<GraphNode | undefined>;
  readonly getNodesByKind: (kind: GraphNode["kind"]) => Promise<readonly GraphNode[]>;
  readonly getNeighbors: (query: GraphNeighborQuery) => Promise<readonly GraphNode[]>;
  readonly traverse: (query: GraphTraversalQuery) => Promise<GraphTraversalResult>;
  readonly findPath: (query: GraphPathQuery) => Promise<GraphPathResult | undefined>;
  readonly getEvidence: (evidenceIds: readonly string[]) => Promise<readonly GraphEvidence[]>;
  readonly explainRelationship: (
    query: GraphRelationshipExplanationQuery
  ) => Promise<GraphExplanation | undefined>;
};

export class RepositoryGraphStoreError extends Error {
  readonly code: "store-read-failed" | "store-write-failed" | "store-corrupt";
  readonly path?: string;

  constructor(code: RepositoryGraphStoreError["code"], message: string, path?: string) {
    super(message);
    this.name = "RepositoryGraphStoreError";
    this.code = code;
    this.path = path;
  }
}

export function resolveRepositoryGraphStorePaths(input: {
  readonly repositoryStateRoot: string;
}): RepositoryGraphStorePaths {
  const graphRoot = join(input.repositoryStateRoot, "graph");

  return {
    graphRoot,
    sqlitePath: join(graphRoot, "graph.sqlite"),
    metadataPath: join(graphRoot, "metadata.json"),
    latestBuildPath: join(graphRoot, "latest-build.json"),
    snapshotsRoot: join(graphRoot, "snapshots")
  };
}
