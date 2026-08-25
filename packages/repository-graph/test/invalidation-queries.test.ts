import { describe, expect, it } from "vitest";

import {
  createJsonFixtureGraphStore,
  planGraphInvalidation,
  queryGraphRelationships,
  queryLegacyCandidates,
  queryRelatedCommands,
  queryRelatedDocs,
  queryRelatedTests,
  queryUnsafeGraphStatus,
  queryUsageEvidence,
  type GraphSnapshot
} from "../src/index.js";

const build = { id: "build-1", repositoryRoot: "/repo", builtAt: "2026-01-01T00:00:00.000Z" };
const file = {
  id: "file",
  kind: "file" as const,
  key: "src/old.ts",
  label: "src/old.ts",
  path: "src/old.ts",
  evidenceIds: [],
  firstObservedBuildId: "build-1",
  lastObservedBuildId: "build-1",
  metadata: { fingerprint: "old" }
};
const test = {
  id: "test",
  kind: "test" as const,
  key: "src/old.test.ts",
  label: "src/old.test.ts",
  path: "src/old.test.ts",
  evidenceIds: [],
  firstObservedBuildId: "build-1",
  lastObservedBuildId: "build-1"
};
const doc = {
  id: "doc",
  kind: "document" as const,
  key: "README.md",
  label: "README.md",
  path: "README.md",
  evidenceIds: [],
  firstObservedBuildId: "build-1",
  lastObservedBuildId: "build-1"
};
const command = {
  id: "command",
  kind: "command" as const,
  key: "test",
  label: "pnpm test",
  evidenceIds: [],
  firstObservedBuildId: "build-1",
  lastObservedBuildId: "build-1"
};
const candidate = {
  id: "candidate",
  kind: "legacy_candidate" as const,
  key: "legacy",
  label: "src/old.ts",
  evidenceIds: [],
  firstObservedBuildId: "build-1",
  lastObservedBuildId: "build-1"
};
const snapshot: GraphSnapshot = {
  build,
  nodes: [file, test, doc, command, candidate],
  evidence: [],
  edges: [
    {
      id: "test-edge",
      sourceNodeId: test.id,
      targetNodeId: file.id,
      kind: "tests",
      confidence: "high",
      evidenceIds: [],
      extractorId: "test",
      firstObservedBuildId: "build-1",
      lastObservedBuildId: "build-1"
    },
    {
      id: "doc-edge",
      sourceNodeId: doc.id,
      targetNodeId: file.id,
      kind: "documents",
      confidence: "medium",
      evidenceIds: [],
      extractorId: "doc",
      firstObservedBuildId: "build-1",
      lastObservedBuildId: "build-1"
    },
    {
      id: "command-edge",
      sourceNodeId: command.id,
      targetNodeId: file.id,
      kind: "verifies",
      confidence: "high",
      evidenceIds: [],
      extractorId: "verify",
      firstObservedBuildId: "build-1",
      lastObservedBuildId: "build-1"
    },
    {
      id: "unsafe-edge",
      sourceNodeId: candidate.id,
      targetNodeId: file.id,
      kind: "unsafe_to_edit",
      confidence: "high",
      evidenceIds: [],
      extractorId: "generated",
      firstObservedBuildId: "build-1",
      lastObservedBuildId: "build-1"
    },
    {
      id: "legacy-edge",
      sourceNodeId: candidate.id,
      targetNodeId: file.id,
      kind: "candidate_for",
      confidence: "high",
      evidenceIds: [],
      extractorId: "doctor",
      firstObservedBuildId: "build-1",
      lastObservedBuildId: "build-1"
    }
  ]
};

describe("graph invalidation and queries", () => {
  it("plans changed, deleted, renamed, and safe full rebuild fallback states", () => {
    expect(planGraphInvalidation({ currentFingerprints: { "src/old.ts": "new" } }).mode).toBe(
      "full"
    );
    const plan = planGraphInvalidation({
      previous: snapshot,
      currentFingerprints: { "src/new.ts": "old" },
      changedOnly: true
    });
    expect(plan).toMatchObject({
      mode: "incremental",
      renamedPaths: [{ from: "src/old.ts", to: "src/new.ts" }]
    });
    expect(plan.invalidatedEdgeIds).toContain("test-edge");
  });
  it("answers bounded related, status, usage, and candidate queries with a structured not-found result", async () => {
    const store = createJsonFixtureGraphStore(snapshot);
    await expect(queryRelatedTests(store, "src/old.ts")).resolves.toMatchObject({ nodes: [test] });
    await expect(queryRelatedDocs(store, "src/old.ts")).resolves.toMatchObject({ nodes: [doc] });
    await expect(queryRelatedCommands(store, "src/old.ts")).resolves.toMatchObject({
      nodes: [command]
    });
    await expect(queryUnsafeGraphStatus(store, "src/old.ts")).resolves.toMatchObject({
      edges: [snapshot.edges[3]]
    });
    await expect(queryUsageEvidence(store, "src/old.ts")).resolves.toMatchObject({
      edges: expect.arrayContaining([snapshot.edges[0]])
    });
    await expect(queryLegacyCandidates(store, "src/old.ts")).resolves.toMatchObject({
      nodes: [candidate]
    });
    await expect(queryGraphRelationships(store, { target: "missing" })).resolves.toMatchObject({
      warnings: ["Graph target not found: missing."]
    });
  });
});
