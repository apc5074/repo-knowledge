import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { VerificationHistory, VerificationRun } from "./types.js";

export type VerificationHistoryStorePaths = {
  readonly verificationRoot: string;
  readonly runsRoot: string;
  readonly latestPath: string;
  readonly historyPath: string;
};

export type VerificationHistoryStore = {
  readonly paths: VerificationHistoryStorePaths;
  readonly ensure: () => Promise<void>;
  readonly writeRun: (run: VerificationRun) => Promise<VerificationRun>;
  readonly readRun: (runId: string) => Promise<VerificationRun | undefined>;
  readonly readLatestRun: () => Promise<VerificationRun | undefined>;
  readonly readHistory: () => Promise<VerificationHistory>;
  readonly updateHistory: (history: VerificationHistory) => Promise<VerificationHistory>;
};

export class VerificationHistoryStoreError extends Error {
  readonly code: "history-corrupt" | "history-write-failed";
  readonly path: string;

  constructor(code: VerificationHistoryStoreError["code"], path: string, message: string) {
    super(message);
    this.name = "VerificationHistoryStoreError";
    this.code = code;
    this.path = path;
  }
}

export function resolveVerificationHistoryStorePaths(input: {
  readonly repositoryStateRoot: string;
}): VerificationHistoryStorePaths {
  const verificationRoot = join(input.repositoryStateRoot, "verification");

  return {
    verificationRoot,
    runsRoot: join(verificationRoot, "runs"),
    latestPath: join(verificationRoot, "latest.json"),
    historyPath: join(verificationRoot, "history.json")
  };
}

export function createJsonVerificationHistoryStore(
  paths: VerificationHistoryStorePaths
): VerificationHistoryStore {
  return {
    paths,
    ensure: async () => {
      await mkdir(paths.runsRoot, { recursive: true });
    },
    writeRun: async (run) => {
      await writeJson(runPath(paths, run.runId), run);
      await writeJson(paths.latestPath, { runId: run.runId });
      await updateHistory(paths, run);
      return run;
    },
    readRun: (runId) => readJson<VerificationRun>(runPath(paths, runId)),
    readLatestRun: async () => {
      const latest = await readJson<{ readonly runId: string }>(paths.latestPath);
      return latest === undefined
        ? undefined
        : readJson<VerificationRun>(runPath(paths, latest.runId));
    },
    readHistory: async () =>
      (await readJson<VerificationHistory>(paths.historyPath)) ?? {
        schemaVersion: 1,
        runs: []
      },
    updateHistory: async (history) => {
      await writeJson(paths.historyPath, history);
      return history;
    }
  };
}

async function updateHistory(
  paths: VerificationHistoryStorePaths,
  run: VerificationRun
): Promise<void> {
  const existing = (await readJson<VerificationHistory>(paths.historyPath)) ?? {
    schemaVersion: 1,
    runs: []
  };
  const entry = {
    runId: run.runId,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    contractPath: run.contractPath,
    summary: run.summary
  } satisfies VerificationHistory["runs"][number];
  const runs = [entry, ...existing.runs.filter((item) => item.runId !== run.runId)].slice(0, 50);

  await writeJson(paths.historyPath, {
    schemaVersion: 1,
    latestRunId: run.runId,
    runs
  } satisfies VerificationHistory);
}

async function readJson<T>(path: string): Promise<T | undefined> {
  let text: string;

  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new VerificationHistoryStoreError(
      "history-corrupt",
      path,
      `Verification history file ${path} contains invalid JSON.`
    );
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;

  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    throw new VerificationHistoryStoreError(
      "history-write-failed",
      path,
      `Failed to write verification history file ${path}: ${String(error)}`
    );
  }
}

function runPath(paths: VerificationHistoryStorePaths, runId: string): string {
  return join(paths.runsRoot, `${runId}.json`);
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
