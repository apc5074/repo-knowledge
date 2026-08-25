import { describe, expect, it } from "vitest";

import {
  createJsonFixtureGraphStore,
  planGraphInvalidation,
  stableGraphEdgeId,
  stableGraphEvidenceId,
  stableGraphNodeId,
  type GraphSnapshot
} from "../src/index.js";

describe("graph storage schema and invalidation", () => {
  it("round-trips evidence-backed metadata and falls back to a full rebuild when prior fingerprints are incomplete", async () => {
    const build = { id: "build-1", repositoryRoot: "/repo", builtAt: "2026-01-01T00:00:00.000Z" };
    const evidence = {
      id: stableGraphEvidenceId({
        kind: "source_location",
        summary: "file",
        sourceLocation: { path: "src/index.ts", startLine: 1 }
      }),
      kind: "source_location" as const,
      summary: "file",
      sourceLocation: { path: "src/index.ts", startLine: 1 }
    };
    const file = {
      id: stableGraphNodeId({ kind: "file", key: "src/index.ts" }),
      kind: "file" as const,
      key: "src/index.ts",
      label: "src/index.ts",
      path: "src/index.ts",
      evidenceIds: [evidence.id],
      firstObservedBuildId: build.id,
      lastObservedBuildId: build.id,
      metadata: { fingerprint: "hash" }
    };
    const target = {
      ...file,
      id: stableGraphNodeId({ kind: "file", key: "src/service.ts" }),
      key: "src/service.ts",
      label: "src/service.ts",
      path: "src/service.ts",
      metadata: undefined
    };
    const edge = {
      id: stableGraphEdgeId({
        sourceNodeId: file.id,
        targetNodeId: target.id,
        kind: "imports",
        extractorId: "test"
      }),
      sourceNodeId: file.id,
      targetNodeId: target.id,
      kind: "imports" as const,
      confidence: "high" as const,
      evidenceIds: [evidence.id],
      extractorId: "test",
      firstObservedBuildId: build.id,
      lastObservedBuildId: build.id
    };
    const snapshot: GraphSnapshot = {
      build,
      nodes: [file, target],
      edges: [edge],
      evidence: [evidence]
    };
    const store = createJsonFixtureGraphStore(snapshot);
    await expect(store.getEvidence([evidence.id])).resolves.toEqual([evidence]);
    await expect(
      store.explainRelationship({ sourceNodeId: file.id, targetNodeId: target.id })
    ).resolves.toMatchObject({ evidence: [evidence] });
    expect(
      planGraphInvalidation({
        previous: snapshot,
        currentFingerprints: { "src/index.ts": "hash" },
        changedOnly: true
      })
    ).toMatchObject({ mode: "full", reason: "A prior file fingerprint is missing." });
  });
});
