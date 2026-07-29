import { describe, expect, it } from "vitest";

import { scannerPackage, scanRepository } from "../src/index.js";

describe("@repo-knowledge/scanner", () => {
  it("exports the scanner package identity", () => {
    expect(scannerPackage).toEqual({
      name: "@repo-knowledge/scanner",
      phase: "phase-0-placeholder"
    });
  });

  it("returns a deterministic no-op scanner result", () => {
    expect(scanRepository({ repositoryRoot: "/tmp/example" })).toEqual({
      schemaVersion: "phase-0-placeholder",
      scannerVersion: "0.0.0",
      repositoryRoot: "/tmp/example",
      facts: [],
      warnings: [
        "Phase 0 scanner placeholder: deterministic repository detectors are implemented in Phase 3."
      ]
    });
  });
});
