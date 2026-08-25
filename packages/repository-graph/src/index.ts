export const repositoryGraphPackage = {
  name: "@repo-knowledge/repository-graph",
  owns: "deterministic-local-repository-understanding-graph",
  phase: "phase-8-repository-graph"
} as const;

export type RepositoryGraphPackage = typeof repositoryGraphPackage;

export {
  repositoryGraphConfidenceLevels,
  repositoryGraphEdgeKinds,
  repositoryGraphEvidenceKinds,
  repositoryGraphNodeKinds,
  repositoryGraphQueryCapabilities,
  stableGraphEdgeId,
  stableGraphEvidenceId,
  stableGraphId,
  stableGraphNodeId
} from "./types.js";
export type {
  BuildRepositoryGraphInput,
  ExplainRepositoryGraphInput,
  GraphBuild,
  GraphEdge,
  GraphEvidence,
  GraphExplanation,
  GraphNode,
  GraphQuery,
  GraphQueryResult,
  GraphSourceLocation,
  QueryRepositoryGraphInput,
  RepositoryGraphConfidence,
  RepositoryGraphEdgeKind,
  RepositoryGraphEvidenceKind,
  RepositoryGraphNodeKind,
  RepositoryGraphQueryCapability
} from "./types.js";
export { RepositoryGraphStoreError, resolveRepositoryGraphStorePaths } from "./graph-store.js";
export type {
  GraphNeighborDirection,
  GraphNeighborQuery,
  GraphPathQuery,
  GraphPathResult,
  GraphRelationshipExplanationQuery,
  GraphSnapshot,
  GraphStore,
  GraphTraversalQuery,
  GraphTraversalResult,
  RepositoryGraphStorePaths
} from "./graph-store.js";
export { createJsonFixtureGraphStore } from "./json-fixture-store.js";
export { createSqliteRepositoryGraphStore } from "./sqlite-store.js";
export { loadGraphBuildContext } from "./build-context.js";
export type { GraphBuildContext, LoadGraphBuildContextInput } from "./build-context.js";
export { ingestRepositoryContract } from "./contract-ingest.js";
export type { GraphIngestResult } from "./contract-ingest.js";
export { ingestScannerFacts } from "./scanner-fact-ingest.js";
export { buildStructuralGraph } from "./structural-nodes.js";
export { buildRuntimeUnitGraph } from "./runtime-nodes.js";
export { indexTypeScriptImports, indexTypeScriptSymbols } from "./typescript-index.js";
export type { TypeScriptIndexInput } from "./typescript-index.js";
export { indexPythonImports, indexPythonSymbols } from "./python-index.js";
export type { PythonIndexInput } from "./python-index.js";
export { buildRouteIndex } from "./route-index.js";
export type { RouteIndexInput } from "./route-index.js";
export { buildRequestFlow } from "./request-flow.js";
export type { RequestFlowInput } from "./request-flow.js";
export { buildWorkerFlow } from "./worker-flow.js";
export { buildDatabaseAccess } from "./database-access.js";
export type { DatabaseAccessInput } from "./database-access.js";
export { buildTestRelations } from "./test-relations.js";
export type { TestRelationsInput } from "./test-relations.js";
export { buildGeneratedPathGraph } from "./generated-paths.js";
export { buildReferenceIndex } from "./reference-index.js";
export type { ReferenceIndexInput } from "./reference-index.js";
export { ingestDoctorRecords } from "./doctor-ingest.js";

import type {
  BuildRepositoryGraphInput,
  ExplainRepositoryGraphInput,
  QueryRepositoryGraphInput
} from "./types.js";

export const repositoryGraphBehavior = {
  localOnly: true,
  storageEngine: "sqlite",
  fixtureStore: "json",
  usesHostedServices: false,
  usesLlmCalls: false,
  mutatesSourceCode: false,
  supportsIncrementalInvalidation: true,
  supportsAgentQueries: true
} as const;

export const repositoryGraphBoundary = {
  owns: [
    "repository graph schema",
    "graph storage abstractions",
    "graph build metadata and invalidation planning",
    "graph-backed query and explanation surfaces"
  ],
  doesNotOwn: [
    "CLI argument parsing",
    "scanner fact extraction",
    "repository contract validation",
    "verification execution",
    "doctor execution",
    "MCP serving",
    "hosted synchronization",
    "source mutation"
  ]
} as const;

export function buildRepositoryGraph(input?: BuildRepositoryGraphInput): Promise<never>;
export async function buildRepositoryGraph(): Promise<never> {
  throw new Error("Repository graph build is not implemented until later Phase 8 tickets.");
}

export function queryRepositoryGraph(input: QueryRepositoryGraphInput): Promise<never>;
export async function queryRepositoryGraph(): Promise<never> {
  throw new Error("Repository graph query is not implemented until later Phase 8 tickets.");
}

export function explainRepositoryGraph(input: ExplainRepositoryGraphInput): Promise<never>;
export async function explainRepositoryGraph(): Promise<never> {
  throw new Error("Repository graph explanation is not implemented until later Phase 8 tickets.");
}
