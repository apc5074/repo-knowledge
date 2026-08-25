import type {
  DiagnosticEvidence,
  KnownProblemRecord,
  LegacyCandidateRecord
} from "@repo-knowledge/doctor-runtime";

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

export function ingestDoctorRecords(input: {
  readonly context: GraphBuildContext;
  readonly buildId: string;
}): GraphIngestResult {
  const records = createRecords(input.buildId);
  for (const problem of input.context.knownProblems) addProblem(records, input.context, problem);
  for (const candidate of input.context.legacyCandidates)
    addCandidate(records, input.context, candidate);
  return result(records);
}
function addProblem(
  records: Records,
  context: GraphBuildContext,
  problem: KnownProblemRecord
): void {
  const evidenceIds = doctorEvidence(records, problem.id, problem.evidence);
  const problemNode = node(
    records,
    "known_problem",
    problem.id,
    problem.title,
    undefined,
    evidenceIds,
    { status: problem.status, severity: problem.severity, confidence: problem.confidence }
  );
  for (const target of problem.targetIds ?? []) {
    const targetNode = targetFor(records, context, "path", target, evidenceIds);
    if (targetNode)
      edge(
        records,
        problemNode.id,
        targetNode.id,
        "matched_known_problem",
        "confirmed",
        evidenceIds
      );
    else records.warnings.push(`Known problem ${problem.id} references missing target ${target}.`);
  }
}
function addCandidate(
  records: Records,
  context: GraphBuildContext,
  candidate: LegacyCandidateRecord
): void {
  const evidenceIds = doctorEvidence(records, candidate.id, candidate.evidence);
  const candidateNode = node(
    records,
    "legacy_candidate",
    candidate.id,
    candidate.target.value,
    candidate.target.path,
    evidenceIds,
    {
      status: candidate.status,
      confidence: candidate.confidence,
      reviewAction: candidate.suggestedReviewAction
    }
  );
  const targetNode = targetFor(
    records,
    context,
    candidate.target.kind,
    candidate.target.path ?? candidate.target.value,
    evidenceIds
  );
  if (targetNode)
    edge(records, candidateNode.id, targetNode.id, "candidate_for", "confirmed", evidenceIds);
  else
    records.warnings.push(
      `Legacy candidate ${candidate.id} references missing target ${candidate.target.path ?? candidate.target.value}.`
    );
}
function targetFor(
  records: Records,
  context: GraphBuildContext,
  kind: LegacyCandidateRecord["target"]["kind"] | "path",
  value: string,
  evidenceIds: readonly string[]
): GraphNode | undefined {
  if (kind === "path")
    return context.inventory.files.includes(value)
      ? node(records, "file", value, value, value, evidenceIds)
      : undefined;
  if (kind === "command") return node(records, "command", value, value, undefined, evidenceIds);
  if (kind === "route") return node(records, "route", value, value, undefined, evidenceIds);
  if (kind === "component") return node(records, "component", value, value, undefined, evidenceIds);
  if (kind === "doc_reference")
    return context.inventory.files.includes(value)
      ? node(records, "document", value, value, value, evidenceIds)
      : undefined;
  if (kind === "symbol") return node(records, "symbol", value, value, undefined, evidenceIds);
  return undefined;
}
function doctorEvidence(
  records: Records,
  recordId: string,
  evidence: readonly DiagnosticEvidence[]
): readonly string[] {
  return evidence.map((item) => {
    const id = stableGraphEvidenceId({
      kind: "doctor",
      summary: item.summary,
      doctorRecordId: recordId,
      sourceLocation: item.path ? { path: item.path, startLine: item.line } : undefined,
      commandSource: item.command
    });
    records.evidence.set(id, {
      id,
      kind: "doctor",
      summary: item.summary,
      doctorRecordKind: "finding",
      doctorRecordId: recordId,
      sourceLocation: item.path ? { path: item.path, startLine: item.line } : undefined,
      commandSource: item.command
    });
    return id;
  });
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
function edge(
  records: Records,
  sourceNodeId: string,
  targetNodeId: string,
  kind: GraphEdge["kind"],
  confidence: GraphEdge["confidence"],
  evidenceIds: readonly string[]
): void {
  const extractorId = "doctor-ingest";
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
