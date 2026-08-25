import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

import { analyzePythonSource } from "@repo-knowledge/scanner-core";

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

export type PythonIndexInput = {
  readonly context: GraphBuildContext;
  readonly buildId: string;
  readonly readSource?: (path: string) => Promise<string>;
};

export async function indexPythonSymbols(input: PythonIndexInput): Promise<GraphIngestResult> {
  const records = createRecords(input.buildId);
  for (const path of pythonPaths(input.context)) {
    const text = await sourceText(input, path, records.warnings);
    if (text === undefined) continue;
    const analysis = analyzePythonSource(path, text);
    records.warnings.push(
      ...analysis.warnings.map((warning) => `${warning.path ?? path}: ${warning.message}`)
    );
    const file = addNode(records, "file", path, path, path, []);
    for (const declaration of declarations(text)) {
      const evidenceId = addEvidence(
        records,
        path,
        declaration.line,
        `${declaration.kind} ${declaration.name}`
      );
      const symbol = addNode(
        records,
        "symbol",
        `${path}#${declaration.name}`,
        declaration.name,
        path,
        [evidenceId],
        { symbolKind: declaration.kind }
      );
      addEdge(records, file.id, symbol.id, "exports", "high", [evidenceId], "python-symbol-index");
    }
  }
  return result(records);
}

export async function indexPythonImports(input: PythonIndexInput): Promise<GraphIngestResult> {
  const records = createRecords(input.buildId);
  const paths = pythonPaths(input.context);
  const pathSet = new Set(paths);
  for (const path of paths) {
    const text = await sourceText(input, path, records.warnings);
    if (text === undefined) continue;
    const analysis = analyzePythonSource(path, text);
    records.warnings.push(
      ...analysis.warnings.map((warning) => `${warning.path ?? path}: ${warning.message}`)
    );
    const file = addNode(records, "file", path, path, path, []);
    for (const imported of imports(text)) {
      const evidenceId = addEvidence(records, path, imported.line, `Import ${imported.module}`);
      const target = resolveLocalModule(imported.module, imported.relativeLevel, path, pathSet);
      if (!target) {
        records.warnings.push(`Could not resolve Python import '${imported.module}' from ${path}.`);
        continue;
      }
      const targetFile = addNode(records, "file", target, target, target, []);
      addEdge(
        records,
        file.id,
        targetFile.id,
        "imports",
        "high",
        [evidenceId],
        "python-import-graph"
      );
    }
  }
  return result(records);
}

type PythonDeclaration = {
  readonly kind: "function" | "class";
  readonly name: string;
  readonly line: number;
};
type PythonImport = {
  readonly module: string;
  readonly relativeLevel: number;
  readonly line: number;
};
type Records = {
  readonly buildId: string;
  readonly nodes: Map<string, GraphNode>;
  readonly edges: Map<string, GraphEdge>;
  readonly evidence: Map<string, GraphEvidence>;
  readonly warnings: string[];
};

function declarations(text: string): readonly PythonDeclaration[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const match = line.match(/^\s*(?:async\s+)?(def|class)\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    return match?.[1] && match[2]
      ? [{ kind: match[1] === "class" ? "class" : "function", name: match[2], line: index + 1 }]
      : [];
  });
}
function imports(text: string): readonly PythonImport[] {
  const result: PythonImport[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const from = line.match(/^\s*from\s+(\.*)([A-Za-z_][A-Za-z0-9_.]*)\s+import\s+/);
    if (from?.[2] !== undefined)
      result.push({ module: from[2], relativeLevel: from[1]?.length ?? 0, line: index + 1 });
    const direct = line.match(/^\s*import\s+([A-Za-z_][A-Za-z0-9_.]*)/);
    if (direct?.[1]) result.push({ module: direct[1], relativeLevel: 0, line: index + 1 });
  }
  return result;
}
function resolveLocalModule(
  module: string,
  relativeLevel: number,
  sourcePath: string,
  paths: ReadonlySet<string>
): string | undefined {
  const sourceDirectory = posix.dirname(sourcePath);
  const base =
    relativeLevel > 0
      ? posix.normalize(
          posix.join(
            sourceDirectory,
            ...Array(Math.max(relativeLevel - 1, 0)).fill(".."),
            module.replaceAll(".", "/")
          )
        )
      : module.replaceAll(".", "/");
  for (const candidate of [`${base}.py`, `${base}/__init__.py`])
    if (paths.has(candidate)) return candidate;
  return undefined;
}
function pythonPaths(context: GraphBuildContext): readonly string[] {
  return context.inventory.files.filter((path) => path.endsWith(".py"));
}
async function sourceText(
  input: PythonIndexInput,
  path: string,
  warnings: string[]
): Promise<string | undefined> {
  try {
    return await (
      input.readSource ??
      ((relativePath) => readFile(join(input.context.repositoryRoot, relativePath), "utf8"))
    )(path);
  } catch (error) {
    warnings.push(
      `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}
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
  const existing = records.nodes.get(id);
  if (existing) return existing;
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
function addEvidence(records: Records, path: string, line: number, summary: string): string {
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
