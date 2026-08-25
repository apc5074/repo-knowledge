import { describe, expect, it } from "vitest";

import {
  graphBuildJson,
  graphExplanationJson,
  graphQueryJson,
  graphStatusJson,
  repositoryGraphJsonSchemaVersion
} from "../src/index.js";

describe("repository graph JSON output", () => {
  it("produces versioned, parseable envelopes without source content", () => {
    const build = { id: "build-1", repositoryRoot: "/repo", builtAt: "2026-01-01T00:00:00.000Z" };
    const query = { nodes: [], edges: [], evidence: [], warnings: [] };
    const explanation = {
      target: {
        id: "file",
        kind: "file" as const,
        key: "src/index.ts",
        label: "src/index.ts",
        evidenceIds: [],
        firstObservedBuildId: "build-1",
        lastObservedBuildId: "build-1"
      },
      relatedNodes: [],
      relationships: [],
      evidence: [],
      summary: "Example",
      warnings: []
    };
    for (const value of [
      graphBuildJson(build),
      graphStatusJson({
        mode: "none",
        addedPaths: [],
        changedPaths: [],
        deletedPaths: [],
        renamedPaths: [],
        invalidatedNodeIds: [],
        invalidatedEdgeIds: []
      }),
      graphQueryJson(query),
      graphExplanationJson(explanation)
    ]) {
      expect(JSON.parse(JSON.stringify(value))).toMatchObject({
        schema_version: repositoryGraphJsonSchemaVersion
      });
    }
  });
});
