import { buildDatabaseAccess } from "./database-access.js";
import { loadGraphBuildContext, type LoadGraphBuildContextInput } from "./build-context.js";
import { ingestRepositoryContract } from "./contract-ingest.js";
import { ingestDoctorRecords } from "./doctor-ingest.js";
import { buildGeneratedPathGraph } from "./generated-paths.js";
import { resolveRepositoryGraphStorePaths, type GraphSnapshot } from "./graph-store.js";
import { buildReferenceIndex } from "./reference-index.js";
import { buildRequestFlow } from "./request-flow.js";
import { buildRouteIndex } from "./route-index.js";
import { buildRuntimeUnitGraph } from "./runtime-nodes.js";
import { ingestScannerFacts } from "./scanner-fact-ingest.js";
import { createSqliteRepositoryGraphStore } from "./sqlite-store.js";
import { buildStructuralGraph } from "./structural-nodes.js";
import { buildTestRelations } from "./test-relations.js";
import { indexTypeScriptImports, indexTypeScriptSymbols } from "./typescript-index.js";
import { indexPythonImports, indexPythonSymbols } from "./python-index.js";
import { buildWorkerFlow } from "./worker-flow.js";
import type { GraphBuild, GraphEdge, GraphEvidence, GraphNode } from "./types.js";

export async function buildLocalRepositoryGraph(
  input: LoadGraphBuildContextInput
): Promise<GraphSnapshot> {
  const context = await loadGraphBuildContext(input);
  const buildId = `graph-${Date.now()}`;
  const parts = await Promise.all([
    ingestRepositoryContract({ context, buildId }),
    ingestScannerFacts({ context, buildId }),
    buildStructuralGraph({ context, buildId }),
    buildRuntimeUnitGraph({ context, buildId }),
    indexTypeScriptSymbols({ context, buildId }),
    indexTypeScriptImports({ context, buildId }),
    indexPythonSymbols({ context, buildId }),
    indexPythonImports({ context, buildId }),
    buildRouteIndex({ context, buildId }),
    buildRequestFlow({ context, buildId }),
    buildWorkerFlow({ context, buildId }),
    buildDatabaseAccess({ context, buildId }),
    buildTestRelations({ context, buildId }),
    buildGeneratedPathGraph({ context, buildId }),
    buildReferenceIndex({ context, buildId }),
    ingestDoctorRecords({ context, buildId })
  ]);
  const nodes = mergeById<GraphNode>(parts.flatMap((part) => part.nodes));
  const edges = mergeById<GraphEdge>(parts.flatMap((part) => part.edges));
  const evidence = mergeById<GraphEvidence>(parts.flatMap((part) => part.evidence));
  const build: GraphBuild = {
    id: buildId,
    repositoryRoot: context.repositoryRoot,
    repositoryStateRoot: context.repositoryStateRoot,
    commitSha: context.commitSha,
    scannerFingerprint: JSON.stringify(context.sourceFingerprints),
    contractPath: context.contractPath,
    contractVersion: context.contract?.version ? String(context.contract.version) : undefined,
    builtAt: new Date().toISOString(),
    summary: { nodeCount: nodes.length, edgeCount: edges.length, evidenceCount: evidence.length },
    metadata: {
      warningCount: context.warnings.length + parts.flatMap((part) => part.warnings).length
    }
  };
  const snapshot = { build, nodes, edges, evidence };
  const store = createSqliteRepositoryGraphStore(
    resolveRepositoryGraphStorePaths({ repositoryStateRoot: context.repositoryStateRoot })
  );
  await store.ensure();
  return store.replaceGraph(snapshot);
}
function mergeById<T extends { readonly id: string }>(values: readonly T[]): readonly T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}
