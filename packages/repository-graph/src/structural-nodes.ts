import { basename, dirname } from "node:path";

import type { GraphBuildContext } from "./build-context.js";
import type { GraphIngestResult } from "./contract-ingest.js";
import {
  stableGraphEdgeId,
  stableGraphEvidenceId,
  stableGraphNodeId,
  type GraphEdge,
  type GraphEvidence,
  type GraphNode,
  type RepositoryGraphNodeKind
} from "./types.js";

export function buildStructuralGraph(input: {
  readonly context: GraphBuildContext;
  readonly buildId: string;
}): GraphIngestResult {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const evidence = new Map<string, GraphEvidence>();
  const paths = input.context.inventory.files;
  const repository = node(nodes, input.buildId, "repository", ".", "Repository", undefined, []);
  const packagePaths = paths.filter((path) => basename(path) === "package.json");
  const workspaceRoots = workspaceRootsFor(input.context, packagePaths);

  for (const path of paths) {
    const fileEvidence = sourceEvidence(evidence, path, "Tracked repository file");
    const file = node(nodes, input.buildId, "file", path, path, path, [fileEvidence], {
      fingerprint: input.context.sourceFingerprints[path] ?? "unavailable"
    });
    const parentPath = directoryPath(path);
    const parent = ensureDirectory(nodes, edges, evidence, input.buildId, repository, parentPath);
    edge(edges, input.buildId, parent.id, file.id, "contains", [fileEvidence], "structural-nodes");
  }

  for (const packagePath of packagePaths) {
    const packageRoot = directoryPath(packagePath);
    const packageEvidence = sourceEvidence(evidence, packagePath, "Package manifest");
    const packageName = packageRoot || "root";
    const packageNode = node(
      nodes,
      input.buildId,
      "package",
      packageRoot || ".",
      packageName,
      packageRoot || undefined,
      [packageEvidence]
    );
    edge(
      edges,
      input.buildId,
      repository.id,
      packageNode.id,
      "contains",
      [packageEvidence],
      "structural-nodes"
    );
    for (const path of paths.filter((candidate) => inDirectory(candidate, packageRoot))) {
      const fileId = stableGraphNodeId({ kind: "file", key: path });
      edge(
        edges,
        input.buildId,
        packageNode.id,
        fileId,
        "owns",
        [packageEvidence],
        "structural-nodes"
      );
    }
  }

  for (const workspaceRoot of workspaceRoots) {
    const workspaceEvidence = sourceEvidence(
      evidence,
      `${workspaceRoot || "."}/package.json`.replace("./", ""),
      "Workspace manifest"
    );
    const workspace = node(
      nodes,
      input.buildId,
      "workspace",
      workspaceRoot || ".",
      workspaceRoot || "workspace",
      workspaceRoot || undefined,
      [workspaceEvidence]
    );
    edge(
      edges,
      input.buildId,
      repository.id,
      workspace.id,
      "contains",
      [workspaceEvidence],
      "structural-nodes"
    );
    for (const packagePath of packagePaths.filter((path) => inDirectory(path, workspaceRoot))) {
      edge(
        edges,
        input.buildId,
        workspace.id,
        stableGraphNodeId({ kind: "package", key: directoryPath(packagePath) || "." }),
        "owns",
        [workspaceEvidence],
        "structural-nodes"
      );
    }
  }
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    evidence: [...evidence.values()],
    warnings: []
  };
}

function ensureDirectory(
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
  evidence: Map<string, GraphEvidence>,
  buildId: string,
  repository: GraphNode,
  path: string
): GraphNode {
  if (!path) return repository;
  const parent = ensureDirectory(nodes, edges, evidence, buildId, repository, directoryPath(path));
  const evidenceId = sourceEvidence(evidence, path, "Repository directory");
  const directory = node(nodes, buildId, "directory", path, path, path, [evidenceId]);
  edge(edges, buildId, parent.id, directory.id, "contains", [evidenceId], "structural-nodes");
  return directory;
}

function workspaceRootsFor(
  context: GraphBuildContext,
  packagePaths: readonly string[]
): readonly string[] {
  const scannerReportsWorkspace = context.scannerResult.facts.some(
    (fact) =>
      fact.kind === "package_manager.detected" &&
      typeof fact.value === "object" &&
      fact.value !== null &&
      (fact.value as { readonly workspace?: unknown }).workspace === true
  );
  return scannerReportsWorkspace && packagePaths.includes("package.json") ? [""] : [];
}

function sourceEvidence(
  evidence: Map<string, GraphEvidence>,
  path: string,
  summary: string
): string {
  const id = stableGraphEvidenceId({ kind: "source_location", summary, sourceLocation: { path } });
  evidence.set(id, { id, kind: "source_location", summary, sourceLocation: { path } });
  return id;
}
function node(
  nodes: Map<string, GraphNode>,
  buildId: string,
  kind: RepositoryGraphNodeKind,
  key: string,
  label: string,
  path: string | undefined,
  evidenceIds: readonly string[],
  metadata?: Readonly<Record<string, string | number | boolean>>
): GraphNode {
  const id = stableGraphNodeId({ kind, key });
  const current = nodes.get(id);
  if (current) return current;
  const value: GraphNode = {
    id,
    kind,
    key,
    label,
    path,
    evidenceIds,
    firstObservedBuildId: buildId,
    lastObservedBuildId: buildId,
    metadata
  };
  nodes.set(id, value);
  return value;
}
function edge(
  edges: Map<string, GraphEdge>,
  buildId: string,
  sourceNodeId: string,
  targetNodeId: string,
  kind: GraphEdge["kind"],
  evidenceIds: readonly string[],
  extractorId: string
): void {
  const id = stableGraphEdgeId({ sourceNodeId, targetNodeId, kind, extractorId });
  edges.set(id, {
    id,
    sourceNodeId,
    targetNodeId,
    kind,
    confidence: "confirmed",
    evidenceIds,
    extractorId,
    firstObservedBuildId: buildId,
    lastObservedBuildId: buildId
  });
}
function directoryPath(path: string): string {
  const parent = dirname(path).replaceAll("\\", "/");
  return parent === "." ? "" : parent;
}
function inDirectory(path: string, directory: string): boolean {
  return directory === "" || path === directory || path.startsWith(`${directory}/`);
}
