import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createJsonVerificationHistoryStore,
  resolveVerificationHistoryStorePaths,
  VerificationHistoryStoreError
} from "../src/index.js";

describe("@repo-knowledge/verification-runtime history store", () => {
  it("writes, reads, and bounds verification run history", async () => {
    const repositoryStateRoot = await createTempDir();
    const store = createJsonVerificationHistoryStore(
      resolveVerificationHistoryStorePaths({ repositoryStateRoot })
    );

    await store.ensure();

    for (let index = 0; index < 51; index += 1) {
      await store.writeRun({
        schemaVersion: 1,
        runId: `run-${index}`,
        repositoryRoot: "/repo",
        startedAt: `2026-08-22T00:00:${String(index).padStart(2, "0")}Z`,
        status: "passed",
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
        results: [],
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          timedOut: 0,
          skipped: 0,
          blocked: 0,
          notConfigured: 0,
          unknown: 0
        },
        warnings: [],
        errors: []
      });
    }

    const history = await store.readHistory();
    expect(history.schemaVersion).toBe(1);
    expect(history.runs).toHaveLength(50);
    expect(history.latestRunId).toBe("run-50");
    expect(history.runs[0]?.runId).toBe("run-50");
    expect(history.runs.at(-1)?.runId).toBe("run-1");

    const latest = await store.readLatestRun();
    expect(latest?.runId).toBe("run-50");
    expect(await store.readRun("run-49")).toMatchObject({ runId: "run-49" });

    const latestJson = JSON.parse(await readFile(join(store.paths.verificationRoot, "latest.json"), "utf8"));
    expect(latestJson).toMatchObject({ runId: "run-50" });
  });

  it("reports corrupt history files with a typed error", async () => {
    const repositoryStateRoot = await createTempDir();
    const store = createJsonVerificationHistoryStore(
      resolveVerificationHistoryStorePaths({ repositoryStateRoot })
    );

    await store.ensure();
    await writeFile(join(store.paths.historyPath), "{not json", "utf8");

    await expect(store.readHistory()).rejects.toBeInstanceOf(VerificationHistoryStoreError);
  });
});

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "board-verification-runtime-"));
}
