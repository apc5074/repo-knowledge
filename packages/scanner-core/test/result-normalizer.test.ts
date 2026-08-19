import { describe, expect, it } from "vitest";

import {
  createScannerEvidence,
  createScannerFact,
  normalizeFact,
  normalizeScanResult,
  stableFactId,
  stableTestTimestamp,
  type RepositoryScanResult
} from "../src/index.js";

describe("Scan result normalizer", () => {
  it("normalizes paths, timestamps, fact ids, evidence, warnings, and errors", () => {
    const first = createScannerFact({
      kind: "command.detected",
      value: {
        name: "test",
        command: "pnpm test",
        cwd: "apps\\api"
      },
      confidence: "high",
      detector: "fixture",
      evidence: [
        createScannerEvidence({
          kind: "config",
          sourcePath: "package.json",
          detector: "fixture",
          lineStart: 2
        })
      ],
      id: "unstable"
    });
    const second = createScannerFact({
      kind: "language.detected",
      value: {
        language: "typescript"
      },
      confidence: "high",
      detector: "fixture",
      evidence: [
        createScannerEvidence({
          kind: "source",
          sourcePath: "src\\index.ts",
          detector: "fixture"
        })
      ],
      id: "also-unstable"
    });
    const result = normalizeScanResult(
      scanResult({
        facts: [first, second],
        warnings: [
          {
            path: "z\\config.yml",
            message: "later"
          },
          {
            path: "a\\config.yml",
            message: "earlier"
          }
        ],
        errors: [
          {
            path: "b\\config.yml",
            message: "error",
            recoverable: true
          }
        ]
      }),
      { testMode: true }
    );

    expect(result.scanned_at).toBe(stableTestTimestamp);
    expect(result.duration_ms).toBe(0);
    expect(result.facts.map((fact) => fact.kind)).toEqual([
      "command.detected",
      "language.detected"
    ]);
    expect(result.facts[0]?.id).not.toBe("unstable");
    expect(result.facts[0]?.value).toMatchObject({
      cwd: "apps/api"
    });
    expect(result.facts[1]?.evidence[0]?.source_path).toBe("src/index.ts");
    expect(result.warnings.map((warning) => warning.path)).toEqual([
      "a/config.yml",
      "z/config.yml"
    ]);
    expect(result.errors[0]?.path).toBe("b/config.yml");
  });

  it("produces stable fact ids for equivalent normalized facts", () => {
    const fact = createScannerFact({
      kind: "application.detected",
      value: {
        path: "apps\\web",
        name: "web"
      },
      confidence: "high",
      detector: "fixture",
      evidence: [
        createScannerEvidence({
          kind: "config",
          sourcePath: "apps\\web\\package.json",
          detector: "fixture"
        })
      ],
      id: "unstable"
    });
    const normalized = normalizeFact(fact);

    expect(normalized.id).toBe(stableFactId(withoutId(normalized)));
    expect(normalizeFact(fact)).toEqual(normalized);
  });
});

function withoutId(
  fact: ReturnType<typeof normalizeFact>
): Omit<ReturnType<typeof normalizeFact>, "id"> {
  return {
    kind: fact.kind,
    value: fact.value,
    confidence: fact.confidence,
    source: fact.source,
    detector: fact.detector,
    evidence: fact.evidence
  };
}

function scanResult(
  overrides: Pick<RepositoryScanResult, "facts" | "warnings" | "errors">
): RepositoryScanResult {
  return {
    schema_version: 1,
    tool_name: "scan_repository",
    repository_root: "/tmp/example",
    scanned_at: "2026-01-01T00:00:00.000Z",
    duration_ms: 123,
    stats: {
      detector_count: 0,
      detectors_succeeded: 0,
      detectors_failed: 0,
      facts_emitted: overrides.facts.length,
      warnings_emitted: overrides.warnings.length,
      errors_emitted: overrides.errors.length,
      files_in_inventory: 0
    },
    ...overrides
  };
}
