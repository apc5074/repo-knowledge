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

export function ingestScannerFacts(input: {
  readonly context: GraphBuildContext;
  readonly buildId: string;
}): GraphIngestResult {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const evidence = new Map<string, GraphEvidence>();
  const warnings: string[] = [];
  const repository = addNode(nodes, input.buildId, "repository", ".", "Repository", undefined, []);

  for (const fact of input.context.scannerResult.facts) {
    const mapped = mapFact(fact);
    if (!mapped) {
      continue;
    }
    const evidenceIds = addFactEvidence(evidence, fact);
    const node = addNode(
      nodes,
      input.buildId,
      mapped.kind,
      mapped.key,
      mapped.label,
      mapped.path,
      evidenceIds
    );
    addEdge(
      edges,
      input.buildId,
      repository.id,
      node.id,
      "contains",
      confidence(fact.confidence),
      evidenceIds
    );
  }
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    evidence: [...evidence.values()],
    warnings
  };
}

function mapFact(
  fact: ScannerFact
): { kind: RepositoryGraphNodeKind; key: string; label: string; path?: string } | undefined {
  const value = objectValue(fact.value);
  const path = stringValue(value.path);
  switch (fact.kind) {
    case "application.detected":
      return named("application", value, path);
    case "service.detected":
    case "compose.service_detected":
      return named("service", value, path);
    case "worker.detected":
      return named("worker", value, path);
    case "api.route_file_detected":
      return named("route", value, path);
    case "command.detected":
      return named("command", value, path);
    case "generated.path_detected":
      return named("generated_artifact", value, path);
    case "documentation.detected":
      return named("document", value, path);
    case "agent_instruction.detected":
    case "repo_skill.detected":
      return named("agent_instruction", value, path);
    case "ci.workflow_detected":
      return named("ci_job", value, path);
    default:
      return undefined;
  }
}

function named(
  kind: RepositoryGraphNodeKind,
  value: Readonly<Record<string, unknown>>,
  path?: string
) {
  const key =
    path ?? stringValue(value.id) ?? stringValue(value.name) ?? stringValue(value.command);
  if (!key) return undefined;
  return { kind, key, label: stringValue(value.name) ?? stringValue(value.command) ?? key, path };
}

function addFactEvidence(
  evidence: Map<string, GraphEvidence>,
  fact: ScannerFact
): readonly string[] {
  const ids: string[] = [];
  for (const source of fact.evidence) {
    const item: GraphEvidence = {
      id: stableGraphEvidenceId({
        kind: "scanner_fact",
        summary: `${fact.kind} from ${fact.detector}`,
        scannerFactId: fact.id,
        sourceLocation: {
          path: source.source_path,
          startLine: source.line_start,
          endLine: source.line_end
        }
      }),
      kind: "scanner_fact",
      summary: `${fact.kind} from ${fact.detector}`,
      scannerFactId: fact.id,
      sourceLocation: {
        path: source.source_path,
        startLine: source.line_start,
        endLine: source.line_end
      }
    };
    evidence.set(item.id, item);
    ids.push(item.id);
  }
  if (ids.length === 0) {
    const id = stableGraphEvidenceId({
      kind: "scanner_fact",
      summary: `${fact.kind} from ${fact.detector}`,
      scannerFactId: fact.id
    });
    evidence.set(id, {
      id,
      kind: "scanner_fact",
      summary: `${fact.kind} from ${fact.detector}`,
      scannerFactId: fact.id
    });
    ids.push(id);
  }
  return ids;
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

function addEdge(
  edges: Map<string, GraphEdge>,
  buildId: string,
  sourceNodeId: string,
  targetNodeId: string,
  kind: GraphEdge["kind"],
  confidence: RepositoryGraphConfidence,
  evidenceIds: readonly string[]
): void {
  const extractorId = "scanner-fact-ingest";
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

function objectValue(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function confidence(value: ScannerFact["confidence"]): RepositoryGraphConfidence {
  return value === "high" ? "high" : value === "medium" ? "medium" : "low";
}
