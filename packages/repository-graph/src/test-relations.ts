import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

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

export type TestRelationsInput = {
  readonly context: GraphBuildContext;
  readonly buildId: string;
  readonly readSource?: (path: string) => Promise<string>;
};
export async function buildTestRelations(input: TestRelationsInput): Promise<GraphIngestResult> {
  const records = createRecords(input.buildId);
  const sources = new Set(input.context.inventory.files.filter((path) => !isTest(path)));
  for (const path of input.context.inventory.files.filter(isTest)) {
    const test = node(records, "test", path, path, path, []);
    const namingTarget = namedTarget(path, sources);
    if (namingTarget)
      connect(
        records,
        test.id,
        node(records, "file", namingTarget, namingTarget, namingTarget, []).id,
        "low",
        evidence(records, path, 1, "Conventional test filename"),
        "naming"
      );
    let text: string;
    try {
      text = await (
        input.readSource ??
        ((relativePath) => readFile(join(input.context.repositoryRoot, relativePath), "utf8"))
      )(path);
    } catch {
      records.warnings.push(`Could not read test ${path}.`);
      continue;
    }
    for (const specifier of importSpecifiers(path, text)) {
      const target = resolveImport(path, specifier, sources);
      if (target)
        connect(
          records,
          test.id,
          node(records, "file", target, target, target, []).id,
          "high",
          evidence(records, path, lineOf(text, specifier), `Test import ${specifier}`),
          "import"
        );
    }
  }
  return result(records);
}
function isTest(path: string): boolean {
  return (
    /(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(path) ||
    /(^|\/)test_[^/]+\.py$/.test(path) ||
    /_test\.py$/.test(path)
  );
}
function namedTarget(path: string, sources: ReadonlySet<string>): string | undefined {
  const base = path
    .replace(/(?:\.test|\.spec)\.[cm]?[jt]sx?$/, "")
    .replace(/(^|\/)test_([^/]+)\.py$/, "$1$2.py")
    .replace(/_test\.py$/, ".py");
  return candidates(base).find((candidate) => sources.has(candidate));
}
function importSpecifiers(path: string, text: string): readonly string[] {
  if (path.endsWith(".py"))
    return [...text.matchAll(/^\s*from\s+(\.*[A-Za-z_][\w.]*)\s+import\s+/gm)].flatMap((match) =>
      match[1] ? [match[1]] : []
    );
  return [...text.matchAll(/(?:import|export)\s+(?:[^"']*?from\s+)?["']([^"']+)["']/g)].flatMap(
    (match) => (match[1] ? [match[1]] : [])
  );
}
function resolveImport(
  path: string,
  specifier: string,
  sources: ReadonlySet<string>
): string | undefined {
  if (path.endsWith(".py")) {
    const relative = specifier.match(/^(\.*)(.+)$/);
    if (!relative?.[2]) return undefined;
    const base = relative[1]
      ? posix.normalize(
          posix.join(
            posix.dirname(path),
            ...Array(Math.max(relative[1].length - 1, 0)).fill(".."),
            relative[2].replaceAll(".", "/")
          )
        )
      : relative[2].replaceAll(".", "/");
    return [`${base}.py`, `${base}/__init__.py`].find((candidate) => sources.has(candidate));
  }
  if (!specifier.startsWith(".")) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(path), specifier));
  return candidates(base).find((candidate) => sources.has(candidate));
}
function candidates(base: string): readonly string[] {
  return [
    base,
    ...[".ts", ".tsx", ".js", ".jsx", ".py"].map((extension) => `${base}${extension}`),
    ...["index.ts", "index.js", "__init__.py"].map((index) => `${base}/${index}`)
  ];
}
function lineOf(text: string, value: string): number {
  return text.slice(0, text.indexOf(value)).split(/\r?\n/).length;
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
function connect(
  records: Records,
  sourceNodeId: string,
  targetNodeId: string,
  confidence: GraphEdge["confidence"],
  evidenceId: string,
  extractor: string
): void {
  const id = stableGraphEdgeId({
    sourceNodeId,
    targetNodeId,
    kind: "tests",
    extractorId: `test-relations:${extractor}`
  });
  records.edges.set(id, {
    id,
    sourceNodeId,
    targetNodeId,
    kind: "tests",
    confidence,
    evidenceIds: [evidenceId],
    extractorId: `test-relations:${extractor}`,
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
