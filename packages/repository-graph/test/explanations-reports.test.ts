import { describe, expect, it } from "vitest";

import {
  createJsonFixtureGraphStore,
  explainGraphTarget,
  formatGraphBuildReport,
  formatGraphExplanationReport,
  formatGraphRelatedReport,
  formatGraphStatusReport,
  type GraphSnapshot
} from "../src/index.js";

const build = {
  id: "build-1",
  repositoryRoot: "/repo",
  builtAt: "2026-01-01T00:00:00.000Z",
  summary: { nodeCount: 3, edgeCount: 2, evidenceCount: 1 }
};
const file = {
  id: "file",
  kind: "file" as const,
  key: "src/index.ts",
  label: "src/index.ts",
  path: "src/index.ts",
  evidenceIds: ["evidence"],
  firstObservedBuildId: "build-1",
  lastObservedBuildId: "build-1"
};
const test = {
  id: "test",
  kind: "test" as const,
  key: "src/index.test.ts",
  label: "src/index.test.ts",
  path: "src/index.test.ts",
  evidenceIds: [],
  firstObservedBuildId: "build-1",
  lastObservedBuildId: "build-1"
};
const candidate = {
  id: "candidate",
  kind: "legacy_candidate" as const,
  key: "legacy",
  label: "src/index.ts",
  evidenceIds: ["evidence"],
  firstObservedBuildId: "build-1",
  lastObservedBuildId: "build-1",
  metadata: { status: "unreviewed", confidence: "low", signalTypes: "name" }
};
const snapshot: GraphSnapshot = {
  build,
  nodes: [file, test, candidate],
  evidence: [
    {
      id: "evidence",
      kind: "source_location",
      summary: "Test reference",
      sourceLocation: { path: "src/index.test.ts", startLine: 3 }
    }
  ],
  edges: [
    {
      id: "tests",
      sourceNodeId: test.id,
      targetNodeId: file.id,
      kind: "tests",
      confidence: "high",
      evidenceIds: ["evidence"],
      extractorId: "test",
      firstObservedBuildId: "build-1",
      lastObservedBuildId: "build-1"
    },
    {
      id: "candidate-for",
      sourceNodeId: candidate.id,
      targetNodeId: file.id,
      kind: "candidate_for",
      confidence: "medium",
      evidenceIds: ["evidence"],
      extractorId: "doctor",
      firstObservedBuildId: "build-1",
      lastObservedBuildId: "build-1"
    }
  ]
};

describe("graph explanations and human reports", () => {
  it("returns deterministic, evidence-backed explanations and clear errors", async () => {
    const store = createJsonFixtureGraphStore(snapshot);
    const fileResult = await explainGraphTarget(store, "src/index.ts");
    expect(fileResult).toMatchObject({ ok: true, explanation: { target: file } });
    const legacy = await explainGraphTarget(store, "legacy");
    expect(legacy).toMatchObject({ ok: true, explanation: { target: candidate } });
    await expect(explainGraphTarget(store, "missing")).resolves.toMatchObject({
      error: "not_found"
    });
  });
  it("formats concise build, status, related, and explanation reports", () => {
    expect(formatGraphBuildReport(build)).toContain("Nodes: 3");
    expect(
      formatGraphStatusReport({
        mode: "incremental",
        addedPaths: [],
        changedPaths: ["src/index.ts"],
        deletedPaths: [],
        renamedPaths: [],
        invalidatedNodeIds: ["file"],
        invalidatedEdgeIds: ["tests"]
      })
    ).toContain("Changed paths: src/index.ts");
    expect(
      formatGraphRelatedReport({ nodes: [test], edges: [], evidence: [], warnings: [] })
    ).toContain("test: src/index.test.ts");
    const explanation = {
      target: file,
      relatedNodes: [test],
      relationships: snapshot.edges,
      evidence: snapshot.evidence,
      summary: "Example",
      warnings: ["Caveat"]
    };
    expect(formatGraphExplanationReport(explanation)).toContain(
      "Evidence: Test reference (src/index.test.ts:3)"
    );
  });
});
