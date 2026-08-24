import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createJsonVerificationHistoryStore,
  resolveVerificationHistoryStorePaths,
  type VerificationCheckResult,
  type VerificationRun
} from "@repo-knowledge/verification-runtime";
import { describe, expect, it } from "vitest";

import { inspectVerificationHistory } from "../src/index.js";

describe("verification history inspector", () => {
  it("reports no observations for passing verification runs", async () => {
    const store = await historyStore();
    await store.writeRun(run("verify-pass", [result("typecheck", "passed")]));

    const inspection = await inspectVerificationHistory({ historyStore: store });

    expect(inspection.latestRun?.runId).toBe("verify-pass");
    expect(inspection.recentRuns).toHaveLength(1);
    expect(inspection.observations).toEqual([]);
    expect(inspection.warnings).toEqual([]);
  });

  it("preserves failed, skipped, blocked, and not-configured checks", async () => {
    const store = await historyStore();
    await store.writeRun(
      run("verify-mixed", [
        result("lint", "failed"),
        result("integration", "blocked"),
        result("smoke", "skipped"),
        result("contract", "not_configured")
      ])
    );

    const inspection = await inspectVerificationHistory({ historyStore: store });

    expect(inspection.observations.map((observation) => observation.kind)).toEqual([
      "failed_check",
      "blocked_check",
      "skipped_check",
      "missing_configured_command"
    ]);
    expect(inspection.observations.map((observation) => observation.runIds)).toEqual([
      ["verify-mixed"],
      ["verify-mixed"],
      ["verify-mixed"],
      ["verify-mixed"]
    ]);
  });

  it("groups repeated failures by check ID, command, and status", async () => {
    const store = await historyStore();
    await store.writeRun(run("verify-1", [result("lint", "failed")]));
    await store.writeRun(run("verify-2", [result("lint", "failed")]));

    const inspection = await inspectVerificationHistory({ historyStore: store });
    const repeated = inspection.observations.find(
      (observation) => observation.kind === "repeated_failure"
    );

    expect(repeated).toMatchObject({
      checkId: "lint",
      command: "pnpm lint",
      count: 2,
      runIds: ["verify-2", "verify-1"]
    });
  });

  it("handles missing verification history without failing doctor", async () => {
    await expect(inspectVerificationHistory({})).resolves.toMatchObject({
      history: {
        schemaVersion: 1,
        runs: []
      },
      recentRuns: [],
      observations: [],
      warnings: ["Verification history state is unavailable."]
    });

    const store = await historyStore();
    await expect(inspectVerificationHistory({ historyStore: store })).resolves.toMatchObject({
      recentRuns: [],
      observations: [],
      warnings: ["No Board verification runs have been recorded."]
    });
  });
});

async function historyStore() {
  const repositoryStateRoot = await mkdtemp(join(tmpdir(), "doctor-verification-inspector-"));
  const store = createJsonVerificationHistoryStore(
    resolveVerificationHistoryStorePaths({ repositoryStateRoot })
  );
  await store.ensure();
  return store;
}

function run(runId: string, results: readonly VerificationCheckResult[]): VerificationRun {
  return {
    schemaVersion: 1,
    runId,
    repositoryRoot: "/repo",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    status: results.some((item) => item.status === "failed") ? "failed" : "passed",
    changeSet: {
      mode: "git",
      paths: [],
      changedPaths: [],
      warnings: []
    },
    plan: {
      mode: "git",
      changeSet: {
        mode: "git",
        paths: [],
        changedPaths: [],
        warnings: []
      },
      selectedChecks: [],
      skippedChecks: [],
      warnings: []
    },
    results,
    summary: {
      total: results.length,
      passed: results.filter((item) => item.status === "passed").length,
      failed: results.filter((item) => item.status === "failed").length,
      timedOut: results.filter((item) => item.status === "timed_out").length,
      skipped: results.filter((item) => item.status === "skipped").length,
      blocked: results.filter((item) => item.status === "blocked").length,
      notConfigured: results.filter((item) => item.status === "not_configured").length,
      unknown: results.filter((item) => item.status === "unknown").length
    },
    warnings: [],
    errors: []
  };
}

function result(id: string, status: VerificationCheckResult["status"]): VerificationCheckResult {
  return {
    id,
    status,
    source: "default",
    command: {
      command: "pnpm",
      args: [id]
    },
    evidence: []
  };
}
