import { readFile } from "node:fs/promises";
import { join } from "node:path";

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

export type RouteIndexInput = {
  readonly context: GraphBuildContext;
  readonly buildId: string;
  readonly readSource?: (path: string) => Promise<string>;
};

export async function buildRouteIndex(input: RouteIndexInput): Promise<GraphIngestResult> {
  const records = createRecords(input.buildId);
  for (const fact of input.context.scannerResult.facts.filter(isRouteFact)) {
    const route = routeValue(fact);
    if (!route.path) {
      records.warnings.push(`Skipped route fact ${fact.id}: no handler path.`);
      continue;
    }
    const evidenceIds = addFactEvidence(records, fact);
    const method = methodFromEvidence(fact) ?? "unknown";
    const routeNode = addNode(
      records,
      "route",
      `${route.path}:${route.route ?? "unknown"}:${method}`,
      route.route ?? route.path,
      route.path,
      evidenceIds,
      { framework: route.framework ?? "unknown", method, path: route.route ?? "unknown" }
    );
    const file = addNode(records, "file", route.path, route.path, route.path, evidenceIds);
    addEdge(records, routeNode.id, file.id, "handles_route", "high", evidenceIds, "route-index");
    const handler = await handlerName(records, input, route.path, fact);
    if (handler) {
      const symbolId = stableGraphNodeId({ kind: "symbol", key: `${route.path}#${handler.name}` });
      addEdge(
        records,
        routeNode.id,
        symbolId,
        "handles_route",
        "high",
        [handler.evidenceId],
        "route-index"
      );
    }
    connectRuntimeUnits(records, input.context, route.path, routeNode.id, evidenceIds);
  }
  return result(records);
}

function connectRuntimeUnits(
  records: Records,
  context: GraphBuildContext,
  routePath: string,
  routeId: string,
  evidenceIds: readonly string[]
): void {
  for (const application of Object.values(context.contract?.applications ?? {})) {
    const root = application.working_directory ?? ".";
    if (root === "." || routePath === root || routePath.startsWith(`${root}/`)) {
      addEdge(
        records,
        stableGraphNodeId({ kind: "application", key: application.id }),
        routeId,
        "handles_route",
        "confirmed",
        evidenceIds,
        "route-index"
      );
      addEdge(
        records,
        stableGraphNodeId({ kind: "component", key: application.id }),
        routeId,
        "handles_route",
        "confirmed",
        evidenceIds,
        "route-index"
      );
    }
  }
}
async function handlerName(
  records: Records,
  input: RouteIndexInput,
  path: string,
  fact: ScannerFact
): Promise<{ name: string; evidenceId: string } | undefined> {
  let text: string;
  try {
    text = await (
      input.readSource ??
      ((relativePath) => readFile(join(input.context.repositoryRoot, relativePath), "utf8"))
    )(path);
  } catch {
    return undefined;
  }
  const line = fact.evidence[0]?.line_start ?? 1;
  const tail = text
    .split(/\r?\n/)
    .slice(line - 1)
    .join("\n");
  const match = path.endsWith(".py")
    ? tail.match(/(?:async\s+)?def\s+([A-Za-z_]\w*)/)
    : tail.match(
        /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|export\s+const\s+([A-Za-z_$][\w$]*)|export\s+default\s+(?:async\s+)?function\s*([A-Za-z_$][\w$]*)?/
      );
  const name =
    match?.[1] ??
    match?.[2] ??
    match?.[3] ??
    (match && !path.endsWith(".py") ? "default" : undefined);
  return name
    ? { name, evidenceId: addSourceEvidence(records, path, line, `Route handler ${name}`) }
    : undefined;
}
function isRouteFact(fact: ScannerFact): boolean {
  return fact.kind === "api.route_file_detected";
}
function routeValue(fact: ScannerFact): { path?: string; route?: string; framework?: string } {
  return fact.value && typeof fact.value === "object"
    ? (fact.value as { path?: string; route?: string; framework?: string })
    : {};
}
function methodFromEvidence(fact: ScannerFact): string | undefined {
  const excerpt = fact.evidence[0]?.excerpt;
  return excerpt
    ?.match(/@(?:\w+\.)?(get|post|put|patch|delete|options|head)\b/i)?.[1]
    ?.toUpperCase();
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
function addNode(
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
  const node: GraphNode = {
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
  records.nodes.set(id, node);
  return node;
}
function addFactEvidence(records: Records, fact: ScannerFact): readonly string[] {
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
function addSourceEvidence(records: Records, path: string, line: number, summary: string): string {
  const id = stableGraphEvidenceId({
    kind: "source_location",
    summary,
    sourceLocation: { path, startLine: line }
  });
  records.evidence.set(id, {
    id,
    kind: "source_location",
    summary,
    sourceLocation: { path, startLine: line }
  });
  return id;
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
