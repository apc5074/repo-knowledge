import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { BootstrapSession, ManagedProcessRecord } from "./types.js";

export type RuntimeStateStorePaths = {
  readonly runtimeRoot: string;
  readonly sessionsRoot: string;
  readonly latestPath: string;
  readonly processesPath: string;
};

export type RuntimeStateStore = {
  readonly paths: RuntimeStateStorePaths;
  readonly ensure: () => Promise<void>;
  readonly createSession: (session: BootstrapSession) => Promise<BootstrapSession>;
  readonly readSession: (sessionId: string) => Promise<BootstrapSession | undefined>;
  readonly updateSession: (session: BootstrapSession) => Promise<BootstrapSession>;
  readonly listSessions: () => Promise<readonly BootstrapSession[]>;
  readonly readLatestSession: () => Promise<BootstrapSession | undefined>;
  readonly writeLatestSession: (sessionId: string) => Promise<void>;
  readonly readProcesses: () => Promise<readonly ManagedProcessRecord[]>;
  readonly writeProcesses: (processes: readonly ManagedProcessRecord[]) => Promise<void>;
  readonly registerProcess: (process: ManagedProcessRecord) => Promise<void>;
  readonly removeProcess: (pid: number) => Promise<void>;
};

export class RuntimeStateStoreError extends Error {
  readonly code: "state-corrupt" | "state-write-failed";
  readonly path: string;

  constructor(code: RuntimeStateStoreError["code"], path: string, message: string) {
    super(message);
    this.name = "RuntimeStateStoreError";
    this.code = code;
    this.path = path;
  }
}

export function resolveRuntimeStateStorePaths(input: {
  readonly repositoryStateRoot: string;
}): RuntimeStateStorePaths {
  const runtimeRoot = join(input.repositoryStateRoot, "runtime");

  return {
    runtimeRoot,
    sessionsRoot: join(runtimeRoot, "sessions"),
    latestPath: join(runtimeRoot, "latest.json"),
    processesPath: join(runtimeRoot, "processes.json")
  };
}

export function createJsonRuntimeStateStore(paths: RuntimeStateStorePaths): RuntimeStateStore {
  return {
    paths,
    ensure: async () => {
      await mkdir(paths.sessionsRoot, { recursive: true });
    },
    createSession: async (session) => {
      await writeJson(sessionPath(paths, session.id), session);
      await writeLatest(paths, session.id);
      return session;
    },
    readSession: (sessionId) => readJson<BootstrapSession>(sessionPath(paths, sessionId)),
    updateSession: async (session) => {
      await writeJson(sessionPath(paths, session.id), session);
      await writeLatest(paths, session.id);
      return session;
    },
    listSessions: async () => {
      const entries = await readdir(paths.sessionsRoot).catch((error: unknown) => {
        if (isNotFoundError(error)) {
          return [];
        }

        throw error;
      });
      const sessions = await Promise.all(
        entries
          .filter((entry) => entry.endsWith(".json"))
          .map((entry) => readJson<BootstrapSession>(join(paths.sessionsRoot, entry)))
      );

      return sessions
        .filter((session): session is BootstrapSession => session !== undefined)
        .sort((left, right) => left.id.localeCompare(right.id));
    },
    readLatestSession: async () => {
      const latest = await readJson<{ readonly sessionId: string }>(paths.latestPath);
      return latest === undefined
        ? undefined
        : readJson<BootstrapSession>(sessionPath(paths, latest.sessionId));
    },
    writeLatestSession: (sessionId) => writeLatest(paths, sessionId),
    readProcesses: async () =>
      (await readJson<readonly ManagedProcessRecord[]>(paths.processesPath)) ?? [],
    writeProcesses: (processes) => writeJson(paths.processesPath, processes),
    registerProcess: async (process) => {
      const processes = await readProcesses(paths);
      await writeJson(paths.processesPath, [...processes, process]);
    },
    removeProcess: async (pid) => {
      const processes = await readProcesses(paths);
      await writeJson(
        paths.processesPath,
        processes.filter((process) => process.pid !== pid)
      );
    }
  };
}

async function readProcesses(
  paths: RuntimeStateStorePaths
): Promise<readonly ManagedProcessRecord[]> {
  return (await readJson<readonly ManagedProcessRecord[]>(paths.processesPath)) ?? [];
}

async function writeLatest(paths: RuntimeStateStorePaths, sessionId: string): Promise<void> {
  await writeJson(paths.latestPath, {
    sessionId
  });
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
    throw new RuntimeStateStoreError(
      "state-corrupt",
      path,
      `Runtime state file ${path} contains invalid JSON.`
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
    throw new RuntimeStateStoreError(
      "state-write-failed",
      path,
      `Failed to write runtime state file ${path}: ${String(error)}`
    );
  }
}

function sessionPath(paths: RuntimeStateStorePaths, sessionId: string): string {
  return join(paths.sessionsRoot, `${sessionId}.json`);
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
