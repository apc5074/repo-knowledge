import { describe, expect, it } from "vitest";

import {
  createScannerEvidence,
  createScannerFact,
  scanRepository,
  scannerCorePackage,
  type RepositoryDetector
} from "../src/index.js";

describe("@repo-knowledge/scanner-core", () => {
  it("exports the scanner core package identity", () => {
    expect(scannerCorePackage).toEqual({
      name: "@repo-knowledge/scanner-core",
      phase: "phase-0-placeholder"
    });
  });

  it("returns a valid scan result with stats for an empty detector list", async () => {
    const result = await scanRepository({
      root: "/tmp/example",
      detectors: [],
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
      errors: [],
      stats: {
        detector_count: 0,
        detectors_succeeded: 0,
        detectors_failed: 0,
        facts_emitted: 0,
        warnings_emitted: 0,
        errors_emitted: 0,
        files_in_inventory: 0
      }
    });
    expect(Date.parse(result.scanned_at)).not.toBeNaN();
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("runs detectors in deterministic registration order", async () => {
    const order: string[] = [];
    const first = createDetector("first", () => {
      order.push("first");

      return {};
    });
    const second = createDetector("second", () => {
      order.push("second");

      return {};
    });

    await scanRepository({
      root: "/tmp/example",
      detectors: [first, second]
    });

    expect(order).toEqual(["first", "second"]);
  });

  it("collects detector facts, warnings, errors, and stats", async () => {
    const fact = createScannerFact({
      kind: "language.detected",
      value: {
        language: "typescript"
      },
      confidence: "high",
      detector: "language",
      evidence: [
        createScannerEvidence({
          kind: "source",
          sourcePath: "src/index.ts",
          detector: "language"
        })
      ]
    });
    const result = await scanRepository({
      root: "/tmp/example",
      detectors: [
        createDetector("language", () => ({
          facts: [fact],
          warnings: [
            {
              detector: "language",
              message: "Mixed language repository."
            }
          ],
          errors: [
            {
              detector: "language",
              message: "Could not inspect one optional file.",
              recoverable: true
            }
          ],
          stats: {
            files_considered: 2,
            files_read: 1
          }
        }))
      ],
      inventory: {
        files: ["src/index.ts", "README.md"]
      }
    });

    expect(result.facts).toEqual([fact]);
    expect(result.warnings).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.stats).toMatchObject({
      detector_count: 1,
      detectors_succeeded: 1,
      detectors_failed: 0,
      facts_emitted: 1,
      warnings_emitted: 1,
      errors_emitted: 1,
      files_in_inventory: 2
    });
  });

  it("isolates failing detectors without crashing the full scan", async () => {
    const result = await scanRepository({
      root: "/tmp/example",
      detectors: [
        createDetector("throws", () => {
          throw new Error("Detector failed.");
        }),
        createDetector("continues", () => ({
          warnings: [
            {
              detector: "continues",
              message: "Still ran."
            }
          ]
        }))
      ]
    });

    expect(result.stats).toMatchObject({
      detector_count: 2,
      detectors_succeeded: 1,
      detectors_failed: 1
    });
    expect(result.errors).toEqual([
      {
        detector: "throws",
        message: "Detector failed.",
        recoverable: true
      }
    ]);
    expect(result.warnings).toEqual([
      {
        detector: "continues",
        message: "Still ran."
      }
    ]);
  });
});

function createDetector(name: string, run: RepositoryDetector["run"]): RepositoryDetector {
  return {
    name,
    version: "0.0.0",
    emittedFactKinds: ["language.detected"],
    run
  };
}
