import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createJsonRuntimeStateStore,
  resolveRuntimeStateStorePaths,
  type BootstrapSession
} from "@repo-knowledge/bootstrap-runtime";
import { describe, expect, it } from "vitest";

import { inspectRuntimeSessions } from "../src/index.js";

describe("runtime session inspector", () => {
  it("reports no failure observations for recent successful sessions", async () => {
    const store = await runtimeStore();

    await store.createSession(session("session-ok", "succeeded"));

    const inspection = await inspectRuntimeSessions({ stateStore: store });

    expect(inspection.latestSession?.id).toBe("session-ok");
    expect(inspection.recentSessions).toHaveLength(1);
    expect(inspection.observations).toEqual([]);
    expect(inspection.warnings).toEqual([]);
  });

  it("reports failed setup, health, resource, migration, and seed observations", async () => {
    const store = await runtimeStore();

    await store.createSession({
      ...session("session-failed", "failed"),
      steps: [
        step("setup-install", "setup", "failed"),
        step("setup-migrate", "setup", "failed"),
        step("setup-seed", "setup", "timed_out")
      ],
      resources: [
        {
          id: "process-api",
          kind: "process",
          status: "failed"
        }
      ],
      commandResults: [
        {
          id: "migrate-db",
          command: "pnpm",
          args: ["migrate"],
          cwd: "/repo",
          status: "failed"
        }
      ],
      healthCheckResults: [
        {
          id: "health-api",
          target: "http://localhost:3000/health",
          status: "failed"
        }
      ]
    });

    const inspection = await inspectRuntimeSessions({ stateStore: store });

    expect(inspection.observations.map((observation) => observation.kind)).toEqual([
      "failed_step",
      "failed_migration",
      "failed_seed",
      "failed_resource",
      "failed_health_check",
      "failed_migration"
    ]);
    expect(
      inspection.observations.every((observation) => observation.sessionId === "session-failed")
    ).toBe(true);
  });

  it("identifies stale running sessions and reads Board-managed processes", async () => {
    const store = await runtimeStore();

    await store.createSession(session("session-stale", "running", "2026-01-01T00:00:00.000Z"));
    await store.registerProcess({
      pid: 123,
      sessionId: "session-stale",
      repositoryRoot: "/repo",
      resourceId: "api",
      command: "node",
      args: ["server.js"],
      cwd: "/repo",
      startedAt: "2026-01-01T00:00:00.000Z"
    });

    const inspection = await inspectRuntimeSessions({
      stateStore: store,
      now: new Date("2026-01-01T02:00:00.000Z"),
      staleAfterMs: 60_000
    });

    expect(inspection.staleSessionIds).toEqual(["session-stale"]);
    expect(inspection.managedProcesses).toEqual([expect.objectContaining({ pid: 123 })]);
    expect(inspection.observations).toEqual([
      expect.objectContaining({
        kind: "stale_session",
        sessionId: "session-stale"
      })
    ]);
  });

  it("handles missing and corrupt runtime state as warnings", async () => {
    await expect(inspectRuntimeSessions({})).resolves.toMatchObject({
      warnings: ["Runtime session state is unavailable."],
      observations: []
    });

    const store = await runtimeStore();
    await writeFile(join(store.paths.sessionsRoot, "bad.json"), "{", "utf8");

    await expect(inspectRuntimeSessions({ stateStore: store })).resolves.toMatchObject({
      recentSessions: [],
      observations: [],
      warnings: [expect.stringContaining("Runtime state could not be read")]
    });
  });
});

async function runtimeStore() {
  const repositoryStateRoot = await mkdtemp(join(tmpdir(), "doctor-runtime-inspector-"));
  const store = createJsonRuntimeStateStore(resolveRuntimeStateStorePaths({ repositoryStateRoot }));
  await store.ensure();
  return store;
}

function session(
  id: string,
  status: BootstrapSession["status"],
  startedAt = "2026-01-01T00:00:00.000Z"
): BootstrapSession {
  return {
    id,
    repositoryRoot: "/repo",
    status,
    startedAt,
    completedAt: status === "running" ? undefined : "2026-01-01T00:00:05.000Z",
    steps: [],
    resources: [],
    commandResults: [],
    healthCheckResults: [],
    warnings: [],
    errors: []
  };
}

function step(
  id: string,
  kind: BootstrapSession["steps"][number]["kind"],
  status: BootstrapSession["status"]
): BootstrapSession["steps"][number] {
  return {
    id,
    kind,
    title: id,
    status,
    summary: `${id} ${status}`,
    dependsOn: []
  };
}
