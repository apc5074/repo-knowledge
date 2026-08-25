import {
  createScannerEvidence,
  createScannerFact,
  type RepositoryScanResult
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import type { GraphBuildContext } from "../src/build-context.js";
import { ingestDoctorRecords } from "../src/doctor-ingest.js";
import { buildReferenceIndex } from "../src/reference-index.js";

const command = createScannerFact({
  kind: "command.detected",
  confidence: "high",
  detector: "command",
  value: { name: "test", command: "pnpm test", cwd: "." },
  evidence: [
    createScannerEvidence({
      kind: "config",
      sourcePath: "package.json",
      detector: "command",
      lineStart: 4
    })
  ]
});
const ci = createScannerFact({
  kind: "ci.workflow_detected",
  confidence: "high",
  detector: "ci",
  value: { path: ".github/workflows/ci.yml", jobs: [{ id: "test", commands: ["pnpm test"] }] },
  evidence: [
    createScannerEvidence({
      kind: "config",
      sourcePath: ".github/workflows/ci.yml",
      detector: "ci",
      lineStart: 1
    })
  ]
});
const doc = createScannerFact({
  kind: "documentation.detected",
  confidence: "high",
  detector: "docs",
  value: { path: "README.md" },
  evidence: [
    createScannerEvidence({
      kind: "documentation",
      sourcePath: "README.md",
      detector: "docs",
      lineStart: 1
    })
  ]
});
const scan: RepositoryScanResult = {
  schema_version: 1,
  tool_name: "scan_repository",
  repository_root: "/repo",
  scanned_at: "2026-01-01T00:00:00.000Z",
  duration_ms: 1,
  facts: [command, ci, doc],
  warnings: [],
  errors: [],
  stats: {
    detector_count: 3,
    detectors_succeeded: 3,
    detectors_failed: 0,
    facts_emitted: 3,
    warnings_emitted: 0,
    errors_emitted: 0,
    files_in_inventory: 3
  }
};
const context: GraphBuildContext = {
  repositoryRoot: "/repo",
  repositoryStateRoot: "/repo/.board/state",
  contractPath: ".board/repository.yaml",
  contract: {
    version: 1,
    repository: { name: "Example", type: "tooling", primary_language: "typescript" },
    verification: {
      default: [
        {
          id: "unit",
          command: { command: "pnpm test" },
          paths: ["src/index.ts"],
          components: ["core"]
        }
      ]
    }
  },
  scannerResult: scan,
  verificationHistory: { schemaVersion: 1, runs: [] },
  knownProblems: [
    {
      id: "known-1",
      fingerprint: "fingerprint",
      title: "Broken route",
      category: "runtime",
      severity: "warning",
      confidence: "high",
      status: "acknowledged",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      occurrenceCount: 1,
      targetIds: ["src/index.ts", "missing.ts"],
      findingIds: ["finding-1"],
      evidence: [{ kind: "file", summary: "route failure", path: "src/index.ts", line: 2 }],
      counterEvidence: [],
      suggestedNextSteps: []
    }
  ],
  legacyCandidates: [
    {
      id: "legacy-1",
      target: { kind: "path", value: "src/index.ts" },
      signalTypes: ["deprecated"],
      confidence: "medium",
      status: "unreviewed",
      detectedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      evidence: [{ kind: "file", summary: "deprecated marker", path: "src/index.ts" }],
      counterEvidence: [],
      replacementHints: [],
      suggestedReviewAction: "review",
      scannerFactIds: []
    }
  ],
  inventory: { files: ["README.md", "src/index.ts", ".github/workflows/ci.yml"] },
  sourceFingerprints: {},
  warnings: []
};

describe("reference and doctor graph ingestion", () => {
  it("indexes command, CI, verification, and documentation references", async () => {
    const result = await buildReferenceIndex({
      context,
      buildId: "build-1",
      readSource: async () => "Run pnpm test against src/index.ts."
    });
    expect(result.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining(["command", "ci_job", "verification_check", "document"])
    );
    expect(result.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining(["runs", "verifies", "documents"])
    );
  });
  it("preserves doctor records, review status, evidence, and missing-target warnings", () => {
    const result = ingestDoctorRecords({ context, buildId: "build-1" });
    expect(result.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining(["known_problem", "legacy_candidate", "file"])
    );
    expect(result.nodes.find((node) => node.kind === "legacy_candidate")?.metadata).toMatchObject({
      status: "unreviewed"
    });
    expect(result.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining(["matched_known_problem", "candidate_for"])
    );
    expect(result.warnings.some((warning) => warning.includes("missing.ts"))).toBe(true);
  });
});
