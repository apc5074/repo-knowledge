import { describe, expect, it } from "vitest";

import {
  createScannerEvidence,
  createScannerFact,
  scanRepository,
  scannerPackage,
  type RepositoryDetector
} from "../src/index.js";

describe("@repo-knowledge/scanner", () => {
  it("exports the scanner package identity", () => {
    expect(scannerPackage).toEqual({
      name: "@repo-knowledge/scanner",
      phase: "phase-3-repository-scanning",
      status: "implemented"
    });
  });

  it("runs the default scanner-core detector set through the public package", async () => {
    const result = await scanRepository({
      root: "/tmp/example",
      inventory: {
        files: []
      }
    });

    expect(result).toMatchObject({
      schema_version: 1,
      tool_name: "scan_repository",
      repository_root: "/tmp/example",
      facts: [],
      warnings: [],
      errors: []
    });
    expect(result.stats.detector_count).toBeGreaterThan(0);
    expect(result.stats.detectors_succeeded).toBe(result.stats.detector_count);
  });

  it("accepts explicit detectors for deterministic callers", async () => {
    const fact = createScannerFact({
      kind: "language.detected",
      value: {
        language: "typescript"
      },
      confidence: "high",
      detector: "test-language",
      evidence: [
        createScannerEvidence({
          kind: "source",
          sourcePath: "src/index.ts",
          detector: "test-language"
        })
      ]
    });
    const detector: RepositoryDetector = {
      name: "test-language",
      version: "1.0.0",
      emittedFactKinds: ["language.detected"],
      run: () => ({
        facts: [fact]
      })
    };

    const result = await scanRepository({
      root: "/tmp/example",
      detectors: [detector],
      inventory: {
        files: ["src/index.ts"]
      }
    });

    expect(result.facts).toEqual([fact]);
    expect(result.stats).toMatchObject({
      detector_count: 1,
      detectors_succeeded: 1,
      facts_emitted: 1
    });
  });
});
