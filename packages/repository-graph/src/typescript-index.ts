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

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

export type TypeScriptIndexInput = {
  readonly context: GraphBuildContext;
  readonly buildId: string;
  readonly readSource?: (path: string) => Promise<string>;
};

export async function indexTypeScriptSymbols(
  input: TypeScriptIndexInput
): Promise<GraphIngestResult> {
  const records = createRecords(input.buildId);
  for (const path of sourcePaths(input.context)) {
    const text = await sourceText(input, path, records.warnings);
    if (text === undefined) continue;
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(path));
    addParseWarnings(records.warnings, path, source);
    const file = addFile(records, path);
    for (const declaration of source.statements) {
      const exported = hasModifier(declaration, ts.SyntaxKind.ExportKeyword);
      if (!exported) continue;
      const name =
        declarationName(declaration) ??
        (hasModifier(declaration, ts.SyntaxKind.DefaultKeyword) ? "default" : undefined);
      if (!name) continue;
      const evidenceId = addSourceEvidence(
        records,
        path,
        source,
        declaration.getStart(source),
        `Export ${name}`
      );
      const symbol = addNode(records, "symbol", `${path}#${name}`, name, path, [evidenceId], {
        exportKind: declarationKind(declaration)
      });
      addEdge(
        records,
        file.id,
        symbol.id,
        "exports",
        "high",
        [evidenceId],
        "typescript-symbol-index"
      );
    }
  }
  return result(records);
}

export async function indexTypeScriptImports(
  input: TypeScriptIndexInput
): Promise<GraphIngestResult> {
  const records = createRecords(input.buildId);
  const paths = sourcePaths(input.context);
  const pathSet = new Set(paths);
  const workspacePackages = await readWorkspacePackages(input.context, input.readSource);
  for (const path of paths) {
    const text = await sourceText(input, path, records.warnings);
    if (text === undefined) continue;
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(path));
    addParseWarnings(records.warnings, path, source);
    const file = addFile(records, path);
    for (const reference of importReferences(source)) {
      const evidenceId = addSourceEvidence(
        records,
        path,
        source,
        reference.position,
        `Import ${reference.specifier}`
      );
      const target = resolveImport(reference.specifier, path, pathSet, workspacePackages);
      if (!target) {
        records.warnings.push(`Could not resolve import '${reference.specifier}' from ${path}.`);
        continue;
      }
      if (target.kind === "file") {
        const targetFile = addFile(records, target.path);
        addEdge(
          records,
          file.id,
          targetFile.id,
          "imports",
          "high",
          [evidenceId],
          "typescript-import-graph"
        );
      } else {
        const packageNode = addNode(records, "package", target.name, target.name, undefined, [
          evidenceId
        ]);
        addEdge(
          records,
          file.id,
          packageNode.id,
          "depends_on",
          "medium",
          [evidenceId],
          "typescript-import-graph"
        );
      }
    }
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
function sourcePaths(context: GraphBuildContext): readonly string[] {
  return context.inventory.files.filter((path) =>
    sourceExtensions.has(posix.extname(path).toLowerCase())
  );
}
async function sourceText(
  input: TypeScriptIndexInput,
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
function scriptKind(path: string): ts.ScriptKind {
  const extension = posix.extname(path).toLowerCase();
  return extension === ".tsx"
    ? ts.ScriptKind.TSX
    : extension === ".jsx"
      ? ts.ScriptKind.JSX
      : extension === ".js" || extension === ".mjs" || extension === ".cjs"
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
}
function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false;
}
function declarationName(node: ts.Statement): string | undefined {
  if (ts.isVariableStatement(node)) return node.declarationList.declarations[0]?.name.getText();
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  )
    return node.name?.text;
  return undefined;
}
function declarationKind(node: ts.Statement): string {
  return ts.SyntaxKind[node.kind];
}
function addParseWarnings(warnings: string[], path: string, source: ts.SourceFile): void {
  const diagnostics =
    (source as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] })
      .parseDiagnostics ?? [];
  for (const diagnostic of diagnostics)
    warnings.push(
      `Could not fully parse ${path}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`
    );
}
function addFile(records: Records, path: string): GraphNode {
  return addNode(records, "file", path, path, path, []);
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
function addSourceEvidence(
  records: Records,
  path: string,
  source: ts.SourceFile,
  position: number,
  summary: string
): string {
  const line = source.getLineAndCharacterOfPosition(position).line + 1;
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
function importReferences(
  source: ts.SourceFile
): readonly { specifier: string; position: number }[] {
  const references: { specifier: string; position: number }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      references.push({
        specifier: node.moduleSpecifier.text,
        position: node.moduleSpecifier.getStart(source)
      });
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      references.push({
        specifier: node.arguments[0].text,
        position: node.arguments[0].getStart(source)
      });
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return references;
}
async function readWorkspacePackages(
  context: GraphBuildContext,
  readSource: TypeScriptIndexInput["readSource"]
): Promise<ReadonlyMap<string, string>> {
  const packages = new Map<string, string>();
  for (const path of context.inventory.files.filter((path) => path.endsWith("package.json"))) {
    try {
      const text = await (
        readSource ??
        ((relativePath) => readFile(join(context.repositoryRoot, relativePath), "utf8"))
      )(path);
      const value = JSON.parse(text) as { name?: unknown };
      if (typeof value.name === "string")
        packages.set(value.name, posix.dirname(path) === "." ? "" : posix.dirname(path));
    } catch {
      /* A malformed manifest is not an import-index failure. */
    }
  }
  return packages;
}
function resolveImport(
  specifier: string,
  sourcePath: string,
  paths: ReadonlySet<string>,
  workspacePackages: ReadonlyMap<string, string>
): { kind: "file"; path: string } | { kind: "package"; name: string } | undefined {
  if (specifier.startsWith(".")) {
    const base = posix.normalize(posix.join(posix.dirname(sourcePath), specifier));
    for (const candidate of candidates(base))
      if (paths.has(candidate)) return { kind: "file", path: candidate };
    return undefined;
  }
  const workspaceRoot = workspacePackages.get(specifier);
  if (workspaceRoot !== undefined) return { kind: "package", name: specifier };
  return undefined;
}
function candidates(base: string): readonly string[] {
  return [
    base,
    ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].map((extension) => `${base}${extension}`),
    ...["index.ts", "index.tsx", "index.js", "index.jsx"].map((index) => `${base}/${index}`)
  ];
}
