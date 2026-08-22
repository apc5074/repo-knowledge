import { describe, expect, it } from "vitest";

import {
  verificationRuntimePackage,
  verificationSelectionModes,
  verificationStatuses
} from "../src/index.js";

describe("@repo-knowledge/verification-runtime types", () => {
  it("exports the package identity and the core status model", () => {
    expect(verificationRuntimePackage).toMatchObject({
      name: "@repo-knowledge/verification-runtime",
      owns: "local-verification-runtime",
      phase: "phase-6-verification-runtime"
    });
    expect(verificationStatuses).toEqual([
      "passed",
      "failed",
      "timed_out",
      "skipped",
      "blocked",
      "not_configured",
      "unknown"
    ]);
    expect(verificationSelectionModes).toEqual(["git", "all", "paths", "components", "checks"]);
  });
});
