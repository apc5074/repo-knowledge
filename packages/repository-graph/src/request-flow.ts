import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

import ts from "typescript";

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

export type RequestFlowInput = {
  readonly context: GraphBuildContext;
  readonly buildId: string;
  readonly readSource?: (path: string) => Promise<string>;
};
export async function buildRequestFlow(input: RequestFlowInput): Promise<GraphIngestResult> {
  const records = createRecords(input.buildId);
  const paths = new Set(input.context.inventory.files);
  const routeFacts = input.context.scannerResult.facts.filter(
    (fact) => fact.kind === "api.route_file_detected"
  );
  for (const fact of routeFacts) {
    const value =
      fact.value && typeof fact.value === "object"
        ? (fact.value as { path?: string; route?: string })
        : {};
    if (!value.path) continue;
    let text: string;
    try {
      text = await (
        input.readSource ?? ((path) => readFile(join(input.context.repositoryRoot, path), "utf8"))
      )(value.path);
    } catch {
      records.warnings.push(`Could not read route handler ${value.path}.`);
      continue;
    }
    const method =
      fact.evidence[0]?.excerpt
        ?.match(/@(?:\w+\.)?(get|post|put|patch|delete|options|head)\b/i)?.[1]
        ?.toUpperCase() ?? "unknown";
    const route = node(
      records,
      "route",
      `${value.path}:${value.route ?? "unknown"}:${method}`,
      value.route ?? value.path,
      value.path,
      []
    );
    for (const call of directLocalCalls(value.path, text, paths)) {
      const evidenceId = evidence(records, value.path, call.line, `Direct route call ${call.name}`);
      const target = node(records, "file", call.target, call.target, call.target, []);
      addEdge(records, route.id, target.id, "calls", "medium", [evidenceId], "request-flow");
    }
  }
  return {
    nodes: [...records.nodes.values()],
    edges: [...records.edges.values()],
    evidence: [...records.evidence.values()],
    warnings: records.warnings
  };
}
function directLocalCalls(
  path: string,
  text: string,
  paths: ReadonlySet<string>
): readonly { name: string; target: string; line: number }[] {
  if (path.endsWith(".py")) return pythonCalls(path, text, paths);
  return tsCalls(path, text, paths);
}
function tsCalls(path: string, text: string, paths: ReadonlySet<string>) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const imports = new Map<string, string>();
  for (const statement of source.statements)
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const target = resolveRelative(path, statement.moduleSpecifier.text, paths);
      if (!target || !statement.importClause) continue;
      const clause = statement.importClause;
      if (clause.name) imports.set(clause.name.text, target);
      for (const item of clause.namedBindings && ts.isNamedImports(clause.namedBindings)
        ? clause.namedBindings.elements
        : [])
        imports.set(item.name.text, target);
    }
  const calls: { name: string; target: string; line: number }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const target = imports.get(node.expression.text);
      if (target)
        calls.push({
          name: node.expression.text,
          target,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
        });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return calls;
}
function pythonCalls(path: string, text: string, paths: ReadonlySet<string>) {
  const imports = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*from\s+(\.*)([A-Za-z_][\w.]*)\s+import\s+([A-Za-z_]\w*)/);
    if (!match?.[2] || !match[3]) continue;
    const target = resolvePython(path, match[2], match[1]?.length ?? 0, paths);
    if (target) imports.set(match[3], target);
  }
  return text.split(/\r?\n/).flatMap((line, index) =>
    [...line.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)].flatMap((match) => {
      const target = imports.get(match[1] ?? "");
      return target && match[1] ? [{ name: match[1], target, line: index + 1 }] : [];
    })
  );
}
function resolveRelative(
  path: string,
  specifier: string,
  paths: ReadonlySet<string>
): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(path), specifier));
  return [
    base,
    ...[".ts", ".tsx", ".js", ".jsx"].map((ext) => `${base}${ext}`),
    ...["index.ts", "index.js"].map((index) => `${base}/${index}`)
  ].find((candidate) => paths.has(candidate));
}
function resolvePython(
  path: string,
  module: string,
  relativeLevel: number,
  paths: ReadonlySet<string>
): string | undefined {
  const base =
    relativeLevel > 0
      ? posix.normalize(
          posix.join(
            posix.dirname(path),
            ...Array(Math.max(relativeLevel - 1, 0)).fill(".."),
            module.replaceAll(".", "/")
          )
        )
      : module.replaceAll(".", "/");
  return [`${base}.py`, `${base}/__init__.py`].find((candidate) => paths.has(candidate));
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
  evidenceIds: readonly string[]
): GraphNode {
  const id = stableGraphNodeId({ kind, key });
  const existing = records.nodes.get(id);
  if (existing) return existing;
  const value: GraphNode = {
    id,
    kind,
    key,
    label,
    path,
    evidenceIds,
    firstObservedBuildId: records.buildId,
    lastObservedBuildId: records.buildId
  };
  records.nodes.set(id, value);
  return value;
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
