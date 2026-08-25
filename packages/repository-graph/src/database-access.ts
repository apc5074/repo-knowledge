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

export type DatabaseAccessInput = {
  readonly context: GraphBuildContext;
  readonly buildId: string;
  readonly readSource?: (path: string) => Promise<string>;
};
export async function buildDatabaseAccess(input: DatabaseAccessInput): Promise<GraphIngestResult> {
  const records = createRecords(input.buildId);
  const databases = new Map<string, GraphNode>();
  for (const fact of input.context.scannerResult.facts.filter(
    (fact) => fact.kind === "database.dependency_detected"
  )) {
    const value = objectValue(fact.value);
    const name = stringValue(value.name) ?? "database";
    const evidenceIds = factEvidence(records, fact);
    const database = node(records, "database", name, name, undefined, evidenceIds);
    databases.set(name, database);
  }
  for (const fact of input.context.scannerResult.facts.filter(
    (fact) =>
      fact.kind === "migration.directory_detected" || fact.kind === "seed.directory_detected"
  )) {
    const value = objectValue(fact.value);
    const path = stringValue(value.path);
    if (!path) continue;
    const evidenceIds = factEvidence(records, fact);
    const target = node(
      records,
      fact.kind === "migration.directory_detected" ? "migration" : "file",
      path,
      path,
      path,
      evidenceIds,
      { role: fact.kind === "migration.directory_detected" ? "migration" : "seed" }
    );
    for (const database of databases.values())
      addEdge(
        records,
        target.id,
        database.id,
        "depends_on",
        confidence(fact.confidence),
        evidenceIds,
        "database-access"
      );
    const command =
      fact.kind === "migration.directory_detected"
        ? input.context.contract?.setup?.migrate
        : input.context.contract?.setup?.seed;
    if (command)
      addEdge(
        records,
        node(records, "command", `setup:${fact.kind}`, command.command, undefined, evidenceIds).id,
        target.id,
        "runs",
        "confirmed",
        evidenceIds,
        "database-access"
      );
  }
  for (const path of input.context.inventory.files.filter(isSourcePath)) {
    let text: string;
    try {
      text = await (
        input.readSource ??
        ((relativePath) => readFile(join(input.context.repositoryRoot, relativePath), "utf8"))
      )(path);
    } catch {
      continue;
    }
    for (const access of directAccesses(text)) {
      const evidenceId = evidence(records, path, access.line, `${access.kind} ${access.table}`);
      const file = node(records, "file", path, path, path, []);
      const table = node(records, "table", access.table, access.table, undefined, [evidenceId]);
      for (const database of databases.values())
        addEdge(
          records,
          table.id,
          database.id,
          "contains",
          "medium",
          [evidenceId],
          "database-access"
        );
      addEdge(records, file.id, table.id, access.kind, "high", [evidenceId], "database-access");
      for (const fact of input.context.scannerResult.facts.filter(
        (item) =>
          (item.kind === "api.route_file_detected" || item.kind === "worker.detected") &&
          objectValue(item.value).path === path
      )) {
        const kind = fact.kind === "api.route_file_detected" ? "route" : "worker";
        const key =
          kind === "route"
            ? `${path}:${stringValue(objectValue(fact.value).route) ?? "unknown"}:${method(fact)}`
            : path;
        addEdge(
          records,
          stableGraphNodeId({ kind, key }),
          table.id,
          access.kind,
          "medium",
          [evidenceId],
          "database-access"
        );
      }
    }
  }
  return result(records);
}
type Access = { kind: "reads" | "writes"; table: string; line: number };
function directAccesses(text: string): readonly Access[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const sql = line.match(
      /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:\*\s+FROM\s+)?([A-Za-z_][\w]*)/i
    );
    if (sql?.[1] && sql[2])
      return [
        {
          kind: sql[1].toUpperCase() === "SELECT" ? "reads" : "writes",
          table: sql[2],
          line: index + 1
        }
      ];
    const prisma = line.match(
      /\b(?:prisma|db)\.([A-Za-z_]\w*)\.(find\w*|count|create|update|delete|upsert)\s*\(/
    );
    if (prisma?.[1] && prisma[2])
      return [
        {
          kind: /^(find|count)/.test(prisma[2]) ? "reads" : "writes",
          table: prisma[1],
          line: index + 1
        }
      ];
    const sqlalchemy = line.match(/\b(?:session\.)?(query|add|delete)\s*\(\s*([A-Za-z_]\w*)/);
    return sqlalchemy?.[1] && sqlalchemy[2]
      ? [
          {
            kind: sqlalchemy[1] === "query" ? "reads" : "writes",
            table: sqlalchemy[2],
            line: index + 1
          }
        ]
      : [];
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
function evidence(records: Records, path: string, line: number, summary: string): string {
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
function method(fact: ScannerFact): string {
  return (
    fact.evidence[0]?.excerpt
      ?.match(/@(?:\w+\.)?(get|post|put|patch|delete|options|head)\b/i)?.[1]
      ?.toUpperCase() ?? "unknown"
  );
}
