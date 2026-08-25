import type { ScannerFact } from "@repo-knowledge/scanner-core";

import type { GraphBuildContext } from "./build-context.js";
import type { GraphIngestResult } from "./contract-ingest.js";
import {
  stableGraphEdgeId,
  stableGraphEvidenceId,
  stableGraphNodeId,
  type GraphEdge,
  type GraphEvidence,
  type GraphNode
} from "./types.js";

export function buildWorkerFlow(input: {
  readonly context: GraphBuildContext;
  readonly buildId: string;
}): GraphIngestResult {
  const records = createRecords(input.buildId);
  for (const fact of input.context.scannerResult.facts.filter(
    (fact) => fact.kind === "worker.detected"
  )) {
    const value = objectValue(fact.value);
    const path = stringValue(value.path);
    const command = stringValue(value.command);
    const queue = stringValue(value.queue);
    const service = stringValue(value.service);
    const key = path ?? command ?? service;
    if (!key) {
      records.warnings.push(`Skipped worker fact ${fact.id}: no stable target.`);
      continue;
    }
    const evidenceIds = factEvidence(records, fact);
    const worker = node(
      records,
      "worker",
      key,
      path ?? command ?? service ?? "worker",
      path,
      evidenceIds,
      { framework: stringValue(value.framework) ?? "unknown" }
    );
    if (path && isSourcePath(path))
      addEdge(
        records,
        worker.id,
        node(records, "file", path, path, path, evidenceIds).id,
        "owns",
        confidence(fact.confidence),
        evidenceIds,
        "worker-flow"
      );
    if (queue)
      addEdge(
        records,
        worker.id,
        node(records, "queue", queue, queue, undefined, evidenceIds).id,
        "depends_on",
        confidence(fact.confidence),
        evidenceIds,
        "worker-flow"
      );
    if (command)
      addEdge(
        records,
        worker.id,
        node(records, "command", `worker:${command}`, command, undefined, evidenceIds).id,
        "runs",
        confidence(fact.confidence),
        evidenceIds,
        "worker-flow"
      );
    if (service)
      addEdge(
        records,
        worker.id,
        node(records, "service", service, service, undefined, evidenceIds).id,
        "depends_on",
        confidence(fact.confidence),
        evidenceIds,
        "worker-flow"
      );
  }
  return result(records);
}
type Records = {
  buildId: string;
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  evidence: Map<string, GraphEvidence>;
  warnings: string[];
};
function createRecords(buildId: string): Records {
  return { buildId, nodes: new Map(), edges: new Map(), evidence: new Map(), warnings: [] };
}
function node(
  records: Records,
  kind: GraphNode["kind"],
  key: string,
  label: string,
  path: string | undefined,
  evidenceIds: readonly string[],
  metadata?: Readonly<Record<string, string | number | boolean>>
): GraphNode {
  const id = stableGraphNodeId({ kind, key });
  const current = records.nodes.get(id);
  if (current) return current;
  const value: GraphNode = {
    id,
    kind,
    key,
    label,
    path,
    evidenceIds,
    firstObservedBuildId: records.buildId,
    lastObservedBuildId: records.buildId,
    metadata
  };
  records.nodes.set(id, value);
  return value;
}
function factEvidence(records: Records, fact: ScannerFact): readonly string[] {
  return fact.evidence.map((source) => {
    const id = stableGraphEvidenceId({
      kind: "scanner_fact",
      summary: `${fact.kind} from ${fact.detector}`,
      scannerFactId: fact.id,
      sourceLocation: { path: source.source_path, startLine: source.line_start }
    });
    records.evidence.set(id, {
      id,
      kind: "scanner_fact",
      summary: `${fact.kind} from ${fact.detector}`,
      scannerFactId: fact.id,
      sourceLocation: { path: source.source_path, startLine: source.line_start }
    });
    return id;
  });
}
function addEdge(
  records: Records,
  sourceNodeId: string,
  targetNodeId: string,
  kind: GraphEdge["kind"],
  confidence: GraphEdge["confidence"],
  evidenceIds: readonly string[],
  extractorId: string
): void {
  const id = stableGraphEdgeId({ sourceNodeId, targetNodeId, kind, extractorId });
  records.edges.set(id, {
    id,
    sourceNodeId,
    targetNodeId,
    kind,
    confidence,
    evidenceIds,
    extractorId,
    firstObservedBuildId: records.buildId,
    lastObservedBuildId: records.buildId
  });
}
function result(records: Records): GraphIngestResult {
  return {
    nodes: [...records.nodes.values()],
    edges: [...records.edges.values()],
    evidence: [...records.evidence.values()],
    warnings: records.warnings
  };
}
function objectValue(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function confidence(value: ScannerFact["confidence"]): GraphEdge["confidence"] {
  return value === "high" ? "high" : value === "medium" ? "medium" : "low";
}
function isSourcePath(path: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(path) || path.endsWith(".py");
}
