import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createJsonRuntimeStateStore,
  getRuntimeStatus,
  resolveRuntimeStateStorePaths,
  type BootstrapSession,
  type ManagedProcessRecord
} from "../src/index.js";

describe("runtime status", () => {
  it("reports the latest session with Board-managed running process state", async () => {
    const repositoryRoot = await tempRoot("latest");
    const stateStore = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot("latest-state")
      })
    );
    const session = runtimeSession({
      id: "session-latest",
      repositoryRoot,
      resources: [
        {
          id: "process-application-api",
          kind: "process",
          status: "running",
          ownerSessionId: "session-latest"
        }
      ]
    });

    await stateStore.ensure();
    await stateStore.createSession(session);
    await stateStore.registerProcess(processRecord({ sessionId: session.id, repositoryRoot }));

    await expect(getRuntimeStatus({ repositoryRoot, stateStore })).resolves.toMatchObject({
      ok: true,
      status: "running",
      session: {
        id: "session-latest",
        status: "running"
      },
      resources: [
        expect.objectContaining({
          id: "process-application-api",
          status: "running",
          ownerSessionId: "session-latest"
        })
      ]
    });
  });

  it("reports selected stale sessions without scanning unrelated processes", async () => {
    const repositoryRoot = await tempRoot("stale");
    const stateStore = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot("stale-state")
      })
    );
    const session = runtimeSession({
      id: "session-stale",
      repositoryRoot,
      resources: [
        {
          id: "process-application-api",
          kind: "process",
          status: "running",
          ownerSessionId: "session-stale"
        }
      ]
    });

    await stateStore.ensure();
    await stateStore.createSession(session);
    await stateStore.registerProcess(
      processRecord({
        sessionId: session.id,
        repositoryRoot,
        pid: 99_999_999
      })
    );

    await expect(
      getRuntimeStatus({
        repositoryRoot,
        sessionId: "session-stale",
        stateStore
      })
    ).resolves.toMatchObject({
      ok: true,
      status: "running",
      warnings: ["process-application-api is recorded in Board state but is no longer running."],
      resources: [
        expect.objectContaining({
          id: "process-application-api",
          status: "stopped"
        })
      ]
    });
  });
});

function runtimeSession(input: {
  readonly id: string;
  readonly repositoryRoot: string;
  readonly resources: BootstrapSession["resources"];
}): BootstrapSession {
  return {
    id: input.id,
    repositoryRoot: input.repositoryRoot,
    status: "running",
    startedAt: "2026-08-20T00:00:00.000Z",
    steps: [],
    resources: input.resources,
    commandResults: [],
    healthCheckResults: [],
    warnings: [],
    errors: []
  };
}

function processRecord(input: {
  readonly sessionId: string;
  readonly repositoryRoot: string;
  readonly pid?: number;
}): ManagedProcessRecord {
  return {
    pid: input.pid ?? process.pid,
    sessionId: input.sessionId,
    repositoryRoot: input.repositoryRoot,
    resourceId: "process-application-api",
    applicationId: "api",
    command: process.execPath,
    args: [],
    cwd: input.repositoryRoot,
    startedAt: "2026-08-20T00:00:00.000Z"
  };
}

async function tempRoot(name: string): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), `board-runtime-status-${name}-`)));
}
