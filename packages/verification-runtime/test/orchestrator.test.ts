import { describe, expect, it } from "vitest";

import { runVerificationOrchestrator } from "../src/index.js";

describe("@repo-knowledge/verification-runtime orchestrator", () => {
  it("returns a non-failing result when no contract is available", async () => {
    const result = await runVerificationOrchestrator({
      repositoryRoot: process.cwd(),
      dryRun: true
    });

    expect(result.ok).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(result.exitCode).toBe(2);
  });
});
