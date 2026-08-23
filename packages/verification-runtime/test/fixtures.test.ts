import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadVerificationContract, runVerificationOrchestrator } from "../src/index.js";

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), "fixtures/repos");

describe("@repo-knowledge/verification-runtime fixture repositories", () => {
  it("loads the multi-package fixture and selects path-specific checks", async () => {
    const repositoryRoot = join(fixturesRoot, "multi-package");
    const result = await runVerificationOrchestrator({
      repositoryRoot,
      changedPaths: ["apps/api/src/index.ts", "packages/shared/src/index.ts"],
      dryRun: true
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.selectedChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "lint" }),
        expect.objectContaining({ id: "api-test" }),
        expect.objectContaining({ id: "shared:command:0" })
      ])
    );
  });

  it("executes the failing-verification fixture with failed and timed-out results", async () => {
    const repositoryRoot = join(fixturesRoot, "failing-verification");
    const result = await runVerificationOrchestrator({
      repositoryRoot,
      all: true,
      dryRun: false
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.run.status).toBe("failed");
    expect(result.run.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "fail", status: "failed" }),
        expect.objectContaining({ id: "timeout", status: "timed_out" })
      ])
    );
  });

  it("reports the no-config fixture as a missing contract", async () => {
    const repositoryRoot = join(fixturesRoot, "no-config");
    const result = await loadVerificationContract({ repositoryRoot });

    expect(result).toMatchObject({
      ok: false,
      reason: "contract-not-found"
    });
  });
});
