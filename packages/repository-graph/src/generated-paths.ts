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

export function buildGeneratedPathGraph(input: {
  readonly context: GraphBuildContext;
  readonly buildId: string;
}): GraphIngestResult {
  const records = createRecords(input.buildId);
  for (const fact of input.context.scannerResult.facts.filter(
    (fact) => fact.kind === "generated.path_detected"
  ))
    addGeneratedFact(records, fact);
  for (const generated of input.context.contract?.generated_files ?? []) {
    const evidenceId = contractEvidence(records, input.context.contractPath);
    const artifact = node(
      records,
      "generated_artifact",
      generated.pattern,
      generated.pattern,
      generated.pattern,
      [evidenceId]
    );
    const target = node(records, "file", generated.pattern, generated.pattern, generated.pattern, [
      evidenceId
    ]);
    edge(records, artifact.id, target.id, "unsafe_to_edit", "confirmed", [evidenceId]);
    if (generated.generated_by)
      edge(
        records,
        node(
          records,
          "command",
          `generate:${generated.generated_by.command}`,
          generated.generated_by.command,
          undefined,
          [evidenceId]
        ).id,
        artifact.id,
        "generates",
        "confirmed",
        [evidenceId]
      );
    for (const sourcePath of generated.source_paths ?? [])
      edge(
        records,
        node(records, "file", sourcePath, sourcePath, sourcePath, [evidenceId]).id,
        artifact.id,
        "generates",
        "confirmed",
        [evidenceId]
      );
  }
  for (const unsafe of input.context.contract?.unsafe_paths ?? []) {
    const evidenceId = contractEvidence(records, input.context.contractPath);
    const source = node(records, "repository", ".", "Repository", undefined, [evidenceId]);
    const target = node(records, "file", unsafe.pattern, unsafe.pattern, unsafe.pattern, [
      evidenceId
    ]);
    edge(records, source.id, target.id, "unsafe_to_edit", "confirmed", [evidenceId]);
  }
  return result(records);
}
function addGeneratedFact(records: Records, fact: ScannerFact): void {
  const value = objectValue(fact.value);
  const path = stringValue(value.path);
  if (!path) {
    records.warnings.push(`Skipped generated-path fact ${fact.id}: no path.`);
    return;
  }
  const evidenceIds = factEvidence(records, fact);
  const artifact = node(records, "generated_artifact", path, path, path, evidenceIds, {
    generator: stringValue(value.generator) ?? "unknown",
    reason: stringValue(value.reason) ?? "generated"
  });
  const target = node(records, "file", path, path, path, evidenceIds);
  edge(records, artifact.id, target.id, "unsafe_to_edit", confidence(fact.confidence), evidenceIds);
  const command = stringValue(value.regenerationCommand);
  if (command)
    edge(
      records,
      node(records, "command", `generate:${command}`, command, undefined, evidenceIds).id,
      artifact.id,
      "generates",
      confidence(fact.confidence),
      evidenceIds
    );
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
function contractEvidence(records: Records, contractPath: string | undefined): string {
  const id = stableGraphEvidenceId({
    kind: "contract",
    summary: "Repository contract generated path",
    contractPath
  });
  records.evidence.set(id, {
    id,
    kind: "contract",
    summary: "Repository contract generated path",
    contractPath
  });
  return id;
}
function edge(
  records: Records,
  sourceNodeId: string,
  targetNodeId: string,
  kind: GraphEdge["kind"],
  confidence: GraphEdge["confidence"],
  evidenceIds: readonly string[]
): void {
  const extractorId = "generated-paths";
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
function result(records: Records): GraphIngestResult {
  return {
    nodes: [...records.nodes.values()],
    edges: [...records.edges.values()],
    evidence: [...records.evidence.values()],
    warnings: records.warnings
  };
}
