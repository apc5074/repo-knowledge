import {
  createScannerEvidence,
  createScannerFact,
  type RepositoryScanResult
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import { ingestRepositoryContract } from "../src/contract-ingest.js";
import { ingestScannerFacts } from "../src/scanner-fact-ingest.js";
import type { GraphBuildContext } from "../src/build-context.js";

const scannerResult: RepositoryScanResult = {
  schema_version: 1,
  tool_name: "scan_repository",
  repository_root: "/repo",
  scanned_at: "2026-01-01T00:00:00.000Z",
  duration_ms: 1,
  warnings: [],
  errors: [],
  facts: [
    createScannerFact({
      kind: "api.route_file_detected",
      confidence: "high",
      detector: "route",
      value: { path: "src/routes/users.ts", route: "/users" },
      evidence: [
        createScannerEvidence({
          kind: "source",
          sourcePath: "src/routes/users.ts",
          detector: "route",
          lineStart: 2
        })
      ]
    }),
    createScannerFact({
      kind: "generated.path_detected",
      confidence: "high",
      detector: "generated",
      value: { path: "src/generated" },
      evidence: [
        createScannerEvidence({
          kind: "source",
          sourcePath: "src/generated/index.ts",
          detector: "generated"
        })
      ]
    })
  ],
  stats: {
    detector_count: 2,
    detectors_succeeded: 2,
    detectors_failed: 0,
    facts_emitted: 2,
    warnings_emitted: 0,
    errors_emitted: 0,
    files_in_inventory: 2
  }
};

const context: GraphBuildContext = {
  repositoryRoot: "/repo",
  repositoryStateRoot: "/repo/.board/state",
  contractPath: ".board/repository.yaml",
  contract: {
    version: 1,
    repository: { name: "Example", type: "tooling", primary_language: "typescript" },
    applications: {
      api: {
        id: "api",
        type: "api",
        entrypoint: "src/server.ts",
        start: { command: "node", args: ["src/server.ts"] }
      }
    },
    services: { database: { id: "database", type: "postgresql" } },
    generated_files: [{ pattern: "src/generated/**" }],
    unsafe_paths: [{ pattern: "src/generated/**", reason: "generated", edit_instead: "schema" }]
  },
  scannerResult,
  verificationHistory: { schemaVersion: 1, runs: [] },
  knownProblems: [],
  legacyCandidates: [],
  inventory: { files: [] },
  sourceFingerprints: {},
  warnings: []
};

describe("graph fact ingestion", () => {
  it("converts contract records into evidence-backed graph records", () => {
    const result = ingestRepositoryContract({ context, buildId: "build-1" });
    expect(result.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining([
        "repository",
        "application",
        "service",
        "command",
        "generated_artifact"
      ])
    );
    expect(result.edges.some((edge) => edge.kind === "unsafe_to_edit")).toBe(true);
    expect(result.evidence[0]?.contractPath).toBe(".board/repository.yaml");
  });

  it("preserves scanner fact IDs and source locations", () => {
    const result = ingestScannerFacts({ context, buildId: "build-1" });
    expect(result.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining(["route", "generated_artifact"])
    );
    expect(
      result.evidence.some(
        (evidence) =>
          evidence.scannerFactId === scannerResult.facts[0]?.id &&
          evidence.sourceLocation?.path === "src/routes/users.ts"
      )
    ).toBe(true);
  });
});
