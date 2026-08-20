import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createJsonRuntimeStateStore,
  resolveRuntimeStateStorePaths,
  RuntimeStateStoreError,
  type BootstrapSession,
  type ManagedProcessRecord
} from "../src/index.js";

describe("runtime JSON state store", () => {
  it("creates, updates, lists, and resolves latest sessions", async () => {
    const store = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot("sessions")
      })
    );
    const first = session("session-a", "pending");
    const second = session("session-b", "running");

    await store.ensure();
    await store.createSession(first);
    await store.createSession(second);
    await store.updateSession({
      ...second,
      status: "succeeded",
      completedAt: "2026-01-01T00:00:05.000Z"
    });

    await expect(store.readSession("session-a")).resolves.toMatchObject({
      id: "session-a",
      status: "pending"
    });
    await expect(store.readLatestSession()).resolves.toMatchObject({
      id: "session-b",
      status: "succeeded"
    });
    await expect(store.listSessions()).resolves.toEqual([
      expect.objectContaining({ id: "session-a" }),
      expect.objectContaining({ id: "session-b" })
    ]);
    await expect(readFile(store.paths.latestPath, "utf8")).resolves.toContain("session-b");
  });

  it("stores and updates the Board-managed process registry", async () => {
    const store = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot("processes")
      })
    );
    const process = processRecord(1234);

    await store.registerProcess(process);
    await store.registerProcess(processRecord(2345));
    await expect(store.readProcesses()).resolves.toEqual([
      expect.objectContaining({ pid: 1234 }),
      expect.objectContaining({ pid: 2345 })
    ]);

    await store.removeProcess(1234);
    await expect(store.readProcesses()).resolves.toEqual([expect.objectContaining({ pid: 2345 })]);
  });

  it("returns undefined for missing sessions and reports corrupt JSON clearly", async () => {
    const store = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot("corrupt")
      })
    );

    await expect(store.readSession("missing")).resolves.toBeUndefined();
    await store.ensure();
    await writeFile(join(store.paths.sessionsRoot, "bad.json"), "{not-json", "utf8");

    await expect(store.readSession("bad")).rejects.toMatchObject({
      name: "RuntimeStateStoreError",
      code: "state-corrupt",
      path: join(store.paths.sessionsRoot, "bad.json")
    } satisfies Partial<RuntimeStateStoreError>);
  });
});

function session(id: string, status: BootstrapSession["status"]): BootstrapSession {
  return {
    id,
    repositoryRoot: "/repo",
    status,
    startedAt: "2026-01-01T00:00:00.000Z",
    steps: [],
    resources: [],
    commandResults: [],
    healthCheckResults: [],
    warnings: [],
    errors: []
  };
}

function processRecord(pid: number): ManagedProcessRecord {
  return {
    pid,
    sessionId: "session-b",
    repositoryRoot: "/repo",
    resourceId: `process-${pid}`,
    command: "node",
    args: ["server.js"],
    cwd: "/repo",
    startedAt: "2026-01-01T00:00:00.000Z"
  };
}

async function tempRoot(name: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `board-runtime-${name}-`));
}
