import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createJsonFixtureGraphStore,
  createSqliteRepositoryGraphStore,
  resolveRepositoryGraphStorePaths,
  stableGraphEdgeId,
  stableGraphEvidenceId,
  stableGraphNodeId,
  type GraphBuild,
  type GraphEdge,
  type GraphEvidence,
  type GraphNode
} from "../src/index.js";

describe("repository graph types and stores", () => {
  it("creates deterministic ids for nodes, edges, and evidence", () => {
    const nodeId = stableGraphNodeId({ kind: "file", key: "src/index.ts" });
    const edgeId = stableGraphEdgeId({
      sourceNodeId: nodeId,
      targetNodeId: "node-other",
      kind: "imports",
      extractorId: "ts-import-graph"
    });
    const evidenceId = stableGraphEvidenceId({
      kind: "source_location",
      summary: "import declaration",
      sourceLocation: {
        path: "src/index.ts",
        startLine: 1
      }
    });

    expect(nodeId).toBe(stableGraphNodeId({ kind: "file", key: "src/index.ts" }));
    expect(edgeId).toContain("edge-");
    expect(evidenceId).toContain("evidence-");
  });

  it("writes and queries a graph snapshot through the sqlite store", async () => {
    const root = await mkdtemp(join(tmpdir(), "repository-graph-store-"));
    const paths = resolveRepositoryGraphStorePaths({ repositoryStateRoot: root });
    const store = createSqliteRepositoryGraphStore(paths);
    await store.ensure();
    const snapshot = fixtureSnapshot();

    await store.replaceGraph(snapshot);

    await expect(store.getBuild(snapshot.build.id)).resolves.toEqual(snapshot.build);
    await expect(store.getLatestBuild()).resolves.toEqual(snapshot.build);
    await expect(store.getNode(snapshot.nodes[0]!.id)).resolves.toEqual(snapshot.nodes[0]);
    await expect(store.getNodesByKind("file")).resolves.toEqual(
      [...snapshot.nodes.filter((node) => node.kind === "file")].sort((left, right) =>
        left.id.localeCompare(right.id)
      )
    );
    await expect(
      store.getNeighbors({
        nodeId: snapshot.nodes[0]!.id,
        edgeKinds: ["imports"],
        direction: "outgoing"
      })
    ).resolves.toEqual([snapshot.nodes[1]!]);
    const traversal = await store.traverse({
      startNodeId: snapshot.nodes[0]!.id,
      direction: "outgoing",
      maxDepth: 2
    });

    expect(traversal.nodes.map((node) => node.id).sort()).toEqual(
      snapshot.nodes.map((node) => node.id).sort()
    );
    expect(traversal.edges.map((edge) => edge.id).sort()).toEqual(
      snapshot.edges.map((edge) => edge.id).sort()
    );
    const path = await store.findPath({
      sourceNodeId: snapshot.nodes[0]!.id,
      targetNodeId: snapshot.nodes[2]!.id,
      direction: "outgoing"
    });

    expect(path).toBeDefined();
    expect(path?.nodes.map((node) => node.id).sort()).toEqual(
      snapshot.nodes.map((node) => node.id).sort()
    );
    expect(path?.edges.map((edge) => edge.id).sort()).toEqual(
      snapshot.edges.map((edge) => edge.id).sort()
    );
    await expect(store.getEvidence([snapshot.evidence[0]!.id])).resolves.toMatchObject([
      snapshot.evidence[0]!
    ]);
    await expect(
      store.explainRelationship({
        sourceNodeId: snapshot.nodes[0]!.id,
        targetNodeId: snapshot.nodes[1]!.id,
        kind: "imports"
      })
    ).resolves.toMatchObject({
      target: snapshot.nodes[0],
      relatedNodes: [snapshot.nodes[1]],
      relationships: [snapshot.edges[0]],
      evidence: [snapshot.evidence[0]]
    });
  });

  it("supports the same snapshot semantics through the json fixture store", async () => {
    const store = createJsonFixtureGraphStore();
    const snapshot = fixtureSnapshot();
    await store.replaceGraph(snapshot);

    await expect(store.getLatestBuild()).resolves.toEqual(snapshot.build);
    await expect(
      store.findPath({
        sourceNodeId: snapshot.nodes[0]!.id,
        targetNodeId: snapshot.nodes[2]!.id
      })
    ).resolves.toMatchObject({
      edges: expect.arrayContaining(snapshot.edges)
    });
  });

  it("fails clearly when sqlite state path cannot be initialized", async () => {
    const root = await mkdtemp(join(tmpdir(), "repository-graph-invalid-"));
    const store = createSqliteRepositoryGraphStore({
      graphRoot: root,
      sqlitePath: root,
      metadataPath: join(root, "metadata.json"),
      latestBuildPath: join(root, "latest-build.json"),
      snapshotsRoot: join(root, "snapshots")
    });

    await expect(store.ensure()).rejects.toMatchObject({
      code: "store-write-failed"
    });
  });
});

function fixtureSnapshot(): {
  readonly build: GraphBuild;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly evidence: readonly GraphEvidence[];
} {
  const build = {
    id: "build-1",
    repositoryRoot: "/repo",
    repositoryStateRoot: "/repo/.board/state",
    builtAt: "2026-08-24T00:00:00.000Z",
    summary: {
      nodeCount: 3,
      edgeCount: 2,
      evidenceCount: 2
    }
  } satisfies GraphBuild;
  const importEvidence = {
    id: stableGraphEvidenceId({
      kind: "source_location",
      summary: "src/index.ts imports src/service.ts",
      sourceLocation: {
        path: "src/index.ts",
        startLine: 1
      }
    }),
    kind: "source_location",
    summary: "src/index.ts imports src/service.ts",
    sourceLocation: {
      path: "src/index.ts",
      startLine: 1
    }
  } satisfies GraphEvidence;
  const routeEvidence = {
    id: stableGraphEvidenceId({
      kind: "scanner_fact",
      summary: "GET /users handled by service",
      scannerFactId: "fact-route-users"
    }),
    kind: "scanner_fact",
    summary: "GET /users handled by service",
    scannerFactId: "fact-route-users"
  } satisfies GraphEvidence;
  const fileNode = {
    id: stableGraphNodeId({ kind: "file", key: "src/index.ts" }),
    kind: "file",
    key: "src/index.ts",
    label: "src/index.ts",
    path: "src/index.ts",
    evidenceIds: [importEvidence.id],
    firstObservedBuildId: build.id,
    lastObservedBuildId: build.id
  } satisfies GraphNode;
  const serviceNode = {
    id: stableGraphNodeId({ kind: "file", key: "src/service.ts" }),
    kind: "file",
    key: "src/service.ts",
    label: "src/service.ts",
    path: "src/service.ts",
    evidenceIds: [importEvidence.id],
    firstObservedBuildId: build.id,
    lastObservedBuildId: build.id
  } satisfies GraphNode;
  const routeNode = {
    id: stableGraphNodeId({ kind: "route", key: "GET /users" }),
    kind: "route",
    key: "GET /users",
    label: "GET /users",
    evidenceIds: [routeEvidence.id],
    firstObservedBuildId: build.id,
    lastObservedBuildId: build.id
  } satisfies GraphNode;
  const importEdge = {
    id: stableGraphEdgeId({
      sourceNodeId: fileNode.id,
      targetNodeId: serviceNode.id,
      kind: "imports",
      extractorId: "ts-import-graph"
    }),
    sourceNodeId: fileNode.id,
    targetNodeId: serviceNode.id,
    kind: "imports",
    confidence: "high",
    evidenceIds: [importEvidence.id],
    extractorId: "ts-import-graph",
    firstObservedBuildId: build.id,
    lastObservedBuildId: build.id
  } satisfies GraphEdge;
  const routeEdge = {
    id: stableGraphEdgeId({
      sourceNodeId: serviceNode.id,
      targetNodeId: routeNode.id,
      kind: "handles_route",
      extractorId: "route-index"
    }),
    sourceNodeId: serviceNode.id,
    targetNodeId: routeNode.id,
    kind: "handles_route",
    confidence: "confirmed",
    evidenceIds: [routeEvidence.id],
    extractorId: "route-index",
    firstObservedBuildId: build.id,
    lastObservedBuildId: build.id
  } satisfies GraphEdge;

  return {
    build,
    nodes: [fileNode, serviceNode, routeNode],
    edges: [importEdge, routeEdge],
    evidence: [importEvidence, routeEvidence]
  };
}
