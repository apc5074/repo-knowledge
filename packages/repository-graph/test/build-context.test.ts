import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createScannerEvidence,
  createScannerFact,
  type RepositoryScanResult
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import { loadGraphBuildContext } from "../src/build-context.js";

function scanResult(root: string): RepositoryScanResult {
  return {
    schema_version: 1,
    tool_name: "scan_repository",
    repository_root: root,
    scanned_at: "2026-01-01T00:00:00.000Z",
    duration_ms: 1,
    warnings: [],
    errors: [],
    facts: [
      createScannerFact({
        kind: "documentation.detected",
        confidence: "high",
        detector: "test",
        value: { path: "README.md" },
        evidence: [
          createScannerEvidence({
            kind: "documentation",
            sourcePath: "README.md",
            detector: "test"
          })
        ]
      })
    ],
    stats: {
      detector_count: 1,
      detectors_succeeded: 1,
      detectors_failed: 0,
      facts_emitted: 1,
      warnings_emitted: 0,
      errors_emitted: 0,
      files_in_inventory: 1
    }
  };
}

describe("loadGraphBuildContext", () => {
  it("loads available inputs and fingerprints source files", async () => {
    const root = await mkdtemp(join(tmpdir(), "repository-graph-context-"));
    await mkdir(join(root, ".board"));
    await writeFile(join(root, "README.md"), "# Example\n");
    await writeFile(
      join(root, ".board/repository.yaml"),
      "version: 1\nrepository:\n  name: Example\n  type: tooling\n  primary_language: typescript\n"
    );
    const context = await loadGraphBuildContext({
      repositoryRoot: root,
      scannerResult: scanResult(root)
    });
    expect(context.contract?.repository.name).toBe("Example");
    expect(context.contractPath).toBe(".board/repository.yaml");
    expect(context.scannerResult.facts).toHaveLength(1);
    expect(context.sourceFingerprints["README.md"]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps missing optional state and contracts non-fatal", async () => {
    const root = await mkdtemp(join(tmpdir(), "repository-graph-context-"));
    await writeFile(join(root, "README.md"), "# Example\n");
    const context = await loadGraphBuildContext({
      repositoryRoot: root,
      scannerResult: scanResult(root)
    });
    expect(context.contract).toBeUndefined();
    expect(context.verificationHistory.runs).toEqual([]);
    expect(context.knownProblems).toEqual([]);
    expect(context.legacyCandidates).toEqual([]);
  });
});
