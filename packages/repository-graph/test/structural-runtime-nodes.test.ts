import {
  createScannerEvidence,
  createScannerFact,
  type RepositoryScanResult
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import type { GraphBuildContext } from "../src/build-context.js";
import { buildRuntimeUnitGraph } from "../src/runtime-nodes.js";
import { buildStructuralGraph } from "../src/structural-nodes.js";

const workspaceFact = createScannerFact({
  kind: "package_manager.detected",
  confidence: "high",
  detector: "manifest",
  value: { name: "pnpm", workspace: true },
  evidence: [
    createScannerEvidence({ kind: "config", sourcePath: "package.json", detector: "manifest" })
  ]
});
const workerFact = createScannerFact({
  kind: "worker.detected",
  confidence: "high",
  detector: "worker",
  value: { name: "queue-worker", path: "apps/worker/src/worker.ts" },
  evidence: [
    createScannerEvidence({
      kind: "source",
      sourcePath: "apps/worker/src/worker.ts",
      detector: "worker"
    })
  ]
});
const scan: RepositoryScanResult = {
  schema_version: 1,
  tool_name: "scan_repository",
  repository_root: "/repo",
  scanned_at: "2026-01-01T00:00:00.000Z",
  duration_ms: 1,
  facts: [workspaceFact, workerFact],
  warnings: [],
  errors: [],
  stats: {
    detector_count: 2,
    detectors_succeeded: 2,
    detectors_failed: 0,
    facts_emitted: 2,
    warnings_emitted: 0,
    errors_emitted: 0,
    files_in_inventory: 4
  }
};
const context: GraphBuildContext = {
  repositoryRoot: "/repo",
  repositoryStateRoot: "/repo/.board/state",
  contractPath: ".board/repository.yaml",
  contract: {
    version: 1,
    repository: { name: "Example", type: "monorepo", primary_language: "typescript" },
    applications: {
      api: {
        id: "api",
        type: "api",
        working_directory: "apps/api",
        entrypoint: "apps/api/src/server.ts",
        start: { command: "node", args: ["src/server.ts"] }
      }
    },
    services: { postgres: { id: "postgres", type: "postgresql" } }
  },
  scannerResult: scan,
  verificationHistory: { schemaVersion: 1, runs: [] },
  knownProblems: [],
  legacyCandidates: [],
  inventory: {
    files: [
      "package.json",
      "apps/api/package.json",
      "apps/api/src/server.ts",
      "apps/worker/src/worker.ts"
    ]
  },
  sourceFingerprints: { "apps/api/src/server.ts": "server-fingerprint" },
  warnings: []
};

describe("structural and runtime graph nodes", () => {
  it("builds stable structural nodes from the filtered inventory", () => {
    const result = buildStructuralGraph({ context, buildId: "build-1" });
    expect(result.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining(["repository", "directory", "file", "package", "workspace"])
    );
    expect(
      result.nodes.find((node) => node.path === "apps/api/src/server.ts")?.metadata
    ).toMatchObject({
      fingerprint: "server-fingerprint"
    });
    expect(result.nodes.some((node) => node.path === "dist/index.js")).toBe(false);
  });

  it("connects contract runtime units and detected workers to evidence-backed targets", () => {
    const result = buildRuntimeUnitGraph({ context, buildId: "build-1" });
    expect(result.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining(["component", "application", "service", "worker"])
    );
    expect(
      result.edges.some(
        (edge) =>
          edge.kind === "owns" && edge.targetNodeId.includes("node-") && edge.evidenceIds.length > 0
      )
    ).toBe(true);
    expect(result.edges.some((edge) => edge.kind === "runs")).toBe(true);
  });
});
