import type { ScannerFact } from "@repo-knowledge/scanner-core";

import type { GraphBuildContext } from "./build-context.js";
import type { GraphIngestResult } from "./contract-ingest.js";
import {
  stableGraphEdgeId,
  stableGraphEvidenceId,
  stableGraphNodeId,
  type GraphEdge,
  type GraphEvidence,
  type GraphNode,
  type RepositoryGraphConfidence,
  type RepositoryGraphNodeKind
} from "./types.js";

export function buildRuntimeUnitGraph(input: {
  readonly context: GraphBuildContext;
  readonly buildId: string;
}): GraphIngestResult {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const evidence = new Map<string, GraphEvidence>();
  const repository = addNode(nodes, input.buildId, "repository", ".", "Repository", undefined, []);
  const contractEvidence = input.context.contractPath
    ? addEvidence(evidence, "contract", "Repository contract", input.context.contractPath)
    : undefined;

  for (const application of Object.values(input.context.contract?.applications ?? {})) {
    const evidenceIds = contractEvidence ? [contractEvidence] : [];
    const applicationNode = addNode(
      nodes,
      input.buildId,
      "application",
      application.id,
      application.name ?? application.id,
      undefined,
      evidenceIds
    );
    const componentNode = addNode(
      nodes,
      input.buildId,
      "component",
      application.id,
      application.name ?? application.id,
      application.working_directory,
      evidenceIds
    );
    connect(
      edges,
      input.buildId,
      repository.id,
      applicationNode.id,
      "contains",
      "confirmed",
      evidenceIds
    );
    connect(
      edges,
      input.buildId,
      componentNode.id,
      applicationNode.id,
      "owns",
      "confirmed",
      evidenceIds
    );
    if (application.entrypoint)
      connect(
        edges,
        input.buildId,
        componentNode.id,
        stableGraphNodeId({ kind: "file", key: application.entrypoint }),
        "owns",
        "confirmed",
        evidenceIds
      );
    for (const [name, command] of Object.entries({
      start: application.start,
      dev: application.dev,
      build: application.build
    })) {
      if (!command) continue;
      connect(
        edges,
        input.buildId,
        applicationNode.id,
        stableGraphNodeId({ kind: "command", key: `application:${application.id}:${name}` }),
        "runs",
        "confirmed",
        evidenceIds
      );
    }
  }
  for (const service of Object.values(input.context.contract?.services ?? {})) {
    const evidenceIds = contractEvidence ? [contractEvidence] : [];
    const serviceNode = addNode(
      nodes,
      input.buildId,
      "service",
      service.id,
      service.name ?? service.id,
      undefined,
      evidenceIds
    );
    connect(
      edges,
      input.buildId,
      repository.id,
      serviceNode.id,
      "contains",
      "confirmed",
      evidenceIds
    );
  }
  for (const fact of input.context.scannerResult.facts) {
    const mapped = scannerRuntimeFact(fact);
    if (!mapped) continue;
    const evidenceIds = fact.evidence.map((source) =>
      addEvidence(
        evidence,
        "scanner_fact",
        `${fact.kind} from ${fact.detector}`,
        source.source_path,
        fact.id
      )
    );
    const runtime = addNode(
      nodes,
      input.buildId,
      mapped.kind,
      mapped.key,
      mapped.label,
      mapped.path,
      evidenceIds
    );
    connect(
      edges,
      input.buildId,
      repository.id,
      runtime.id,
      "contains",
      scannerConfidence(fact.confidence),
      evidenceIds
    );
    if (mapped.kind === "worker" && mapped.path)
      connect(
        edges,
        input.buildId,
        runtime.id,
        stableGraphNodeId({ kind: "file", key: mapped.path }),
        "owns",
        scannerConfidence(fact.confidence),
        evidenceIds
      );
    if (mapped.kind === "application" && mapped.path) {
      const component = addNode(
        nodes,
        input.buildId,
        "component",
        mapped.key,
        mapped.label,
        mapped.path,
        evidenceIds
      );
      connect(
        edges,
        input.buildId,
        component.id,
        runtime.id,
        "owns",
        scannerConfidence(fact.confidence),
        evidenceIds
      );
      connect(
        edges,
        input.buildId,
        component.id,
        stableGraphNodeId({ kind: "file", key: mapped.path }),
        "owns",
        scannerConfidence(fact.confidence),
        evidenceIds
      );
    }
  }
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    evidence: [...evidence.values()],
    warnings: []
  };
}

function scannerRuntimeFact(
  fact: ScannerFact
): { kind: "application" | "worker"; key: string; label: string; path?: string } | undefined {
  if (fact.kind !== "application.detected" && fact.kind !== "worker.detected") return undefined;
  const value =
    fact.value && typeof fact.value === "object" ? (fact.value as Record<string, unknown>) : {};
  const path = typeof value.path === "string" ? value.path : undefined;
  const key =
    (typeof value.id === "string" ? value.id : undefined) ??
    (typeof value.name === "string" ? value.name : undefined) ??
    path;
  return key
    ? {
        kind: fact.kind === "worker.detected" ? "worker" : "application",
        key,
        label: typeof value.name === "string" ? value.name : key,
        path
      }
    : undefined;
}
function addEvidence(
  evidence: Map<string, GraphEvidence>,
  kind: GraphEvidence["kind"],
  summary: string,
  path: string,
  scannerFactId?: string
): string {
  const id = stableGraphEvidenceId({
    kind,
    summary,
    contractPath: kind === "contract" ? path : undefined,
    scannerFactId,
    sourceLocation: kind === "contract" ? undefined : { path }
  });
  evidence.set(id, {
    id,
    kind,
    summary,
    contractPath: kind === "contract" ? path : undefined,
    scannerFactId,
    sourceLocation: kind === "contract" ? undefined : { path }
  });
  return id;
}
function addNode(
  nodes: Map<string, GraphNode>,
  buildId: string,
  kind: RepositoryGraphNodeKind,
  key: string,
  label: string,
  path: string | undefined,
  evidenceIds: readonly string[]
): GraphNode {
  const id = stableGraphNodeId({ kind, key });
  const existing = nodes.get(id);
  if (existing) return existing;
  const node: GraphNode = {
    id,
    kind,
    key,
    label,
    path,
    evidenceIds,
    firstObservedBuildId: buildId,
    lastObservedBuildId: buildId
  };
  nodes.set(id, node);
  return node;
}
function connect(
  edges: Map<string, GraphEdge>,
  buildId: string,
  sourceNodeId: string,
  targetNodeId: string,
  kind: GraphEdge["kind"],
  confidence: RepositoryGraphConfidence,
  evidenceIds: readonly string[]
): void {
  const extractorId = "runtime-nodes";
  const id = stableGraphEdgeId({ sourceNodeId, targetNodeId, kind, extractorId });
  edges.set(id, {
    id,
    sourceNodeId,
    targetNodeId,
    kind,
    confidence,
    evidenceIds,
    extractorId,
    firstObservedBuildId: buildId,
    lastObservedBuildId: buildId
  });
}
function scannerConfidence(confidence: ScannerFact["confidence"]): RepositoryGraphConfidence {
  return confidence === "high" ? "high" : confidence === "medium" ? "medium" : "low";
}
