import { describe, expect, it } from "vitest";

import {
  buildRepositoryGraph,
  explainRepositoryGraph,
  queryRepositoryGraph,
  repositoryGraphBehavior,
  repositoryGraphBoundary,
  repositoryGraphConfidenceLevels,
  repositoryGraphEdgeKinds,
  repositoryGraphNodeKinds,
  repositoryGraphPackage,
  repositoryGraphQueryCapabilities
} from "../src/index.js";

describe("@repo-knowledge/repository-graph", () => {
  it("exports the repository graph package identity", () => {
    expect(repositoryGraphPackage).toEqual({
      name: "@repo-knowledge/repository-graph",
      owns: "deterministic-local-repository-understanding-graph",
      phase: "phase-8-repository-graph"
    });
  });

  it("defines initial graph kinds, confidence levels, and query capabilities", () => {
    expect(repositoryGraphNodeKinds).toContain("route");
    expect(repositoryGraphNodeKinds).toContain("legacy_candidate");
    expect(repositoryGraphEdgeKinds).toContain("replaced_by");
    expect(repositoryGraphEdgeKinds).toContain("matched_known_problem");
    expect(repositoryGraphConfidenceLevels).toEqual(["low", "medium", "high", "confirmed"]);
    expect(repositoryGraphQueryCapabilities).toEqual([
      "getNode",
      "getNeighbors",
      "traverse",
      "findPath",
      "getEvidence",
      "explainRelationship"
    ]);
  });

  it("keeps the Phase 8 boundary local, graph-first, and non-mutating", () => {
    expect(repositoryGraphBehavior).toMatchObject({
      localOnly: true,
      storageEngine: "sqlite",
      usesHostedServices: false,
      usesLlmCalls: false,
      mutatesSourceCode: false,
      supportsIncrementalInvalidation: true,
      supportsAgentQueries: true
    });
    expect(repositoryGraphBoundary.owns).toContain("graph storage abstractions");
    expect(repositoryGraphBoundary.doesNotOwn).toContain("source mutation");
  });

  it("exposes build, query, and explanation APIs", async () => {
    expect(buildRepositoryGraph).toBeTypeOf("function");
    await expect(queryRepositoryGraph({ target: "src/index.ts" })).rejects.toThrow(
      /not implemented/i
    );
    await expect(explainRepositoryGraph({ target: "src/index.ts" })).rejects.toThrow(
      /not implemented/i
    );
  });
});
