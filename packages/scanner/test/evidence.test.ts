import { describe, expect, it } from "vitest";

import {
  confidenceRank,
  createScannerEvidence,
  isScannerConfidence,
  normalizeRepositoryRelativePath,
  toContractEvidenceReference
} from "../src/index.js";

describe("scanner evidence", () => {
  it("creates repository-relative evidence with line ranges and short excerpts", () => {
    const evidence = createScannerEvidence({
      kind: "config",
      sourcePath: "./package.json",
      detector: "package-manager",
      lineStart: 3,
      lineEnd: 5,
      excerpt: '  "packageManager": "pnpm@9.15.4"  '
    });

    expect(evidence).toEqual({
      kind: "config",
      source_path: "package.json",
      line_start: 3,
      line_end: 5,
      excerpt: '"packageManager": "pnpm@9.15.4"',
      detector: "package-manager"
    });
  });

  it("rejects absolute, escaping, invalid line, and detector-less evidence", () => {
    expect(() => normalizeRepositoryRelativePath("/tmp/package.json")).toThrow(
      "repository-relative"
    );
    expect(() => normalizeRepositoryRelativePath("../package.json")).toThrow(
      "inside the repository"
    );
    expect(() =>
      createScannerEvidence({
        kind: "source",
        sourcePath: "src/index.ts",
        detector: "typescript",
        lineStart: 10,
        lineEnd: 9
      })
    ).toThrow("lineEnd");
    expect(() =>
      createScannerEvidence({
        kind: "source",
        sourcePath: "src/index.ts",
        detector: " "
      })
    ).toThrow("detector");
  });

  it("maps to the shared repository contract evidence reference shape", () => {
    const evidence = createScannerEvidence({
      kind: "documentation",
      sourcePath: "README.md",
      detector: "docs",
      lineStart: 12
    });

    expect(toContractEvidenceReference(evidence, "medium")).toEqual({
      sourcePath: "README.md",
      lineStart: 12,
      lineEnd: undefined,
      detector: "docs",
      confidence: "medium"
    });
  });

  it("documents conservative confidence ordering", () => {
    expect(isScannerConfidence("high")).toBe(true);
    expect(isScannerConfidence("unknown")).toBe(false);
    expect(confidenceRank("high")).toBeGreaterThan(confidenceRank("medium"));
    expect(confidenceRank("medium")).toBeGreaterThan(confidenceRank("low"));
  });
});
