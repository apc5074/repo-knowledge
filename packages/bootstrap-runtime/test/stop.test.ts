import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createJsonRuntimeStateStore,
  resolveRuntimeStateStorePaths,
  stopRuntime,
  type BootstrapSession,
  type ManagedProcessRecord
} from "../src/index.js";

describe("runtime stop", () => {
  it("stops Board-managed processes for the latest repository session", async () => {
    const repositoryRoot = await tempRoot("process");
    const stateStore = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot("process-state")
      })
    );

    await stateStore.ensure();
    await stateStore.createSession(
      runtimeSession({
        id: "session-process",
        repositoryRoot,
        resources: [
          {
            id: "process-application-api",
            kind: "process",
            status: "running",
            ownerSessionId: "session-process"
          }
        ]
      })
    );
    await stateStore.registerProcess(
      processRecord({
        sessionId: "session-process",
        repositoryRoot,
        pid: 99_999_999
      })
    );

    const result = await stopRuntime({
      repositoryRoot,
      stateStore
    });

    expect(result).toMatchObject({
      ok: true,
      status: "stopped",
      stoppedSessionIds: ["session-process"],
      stoppedResources: [
        expect.objectContaining({
          id: "process-application-api",
          kind: "process",
          status: "stopped"
        })
      ]
    });
    await expect(stateStore.readProcesses()).resolves.toEqual([]);
    await expect(stateStore.readLatestSession()).resolves.toMatchObject({
      status: "stopped",
      resources: [
        expect.objectContaining({
          id: "process-application-api",
          status: "stopped"
        })
      ]
    });
  });

  it("stops Compose projects recorded in Board session metadata", async () => {
    const repositoryRoot = await tempRoot("compose");
    const stateStore = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot("compose-state")
      })
    );
    const stops: string[] = [];

    await stateStore.ensure();
    await stateStore.createSession(
      runtimeSession({
        id: "session-compose",
        repositoryRoot,
        resources: [
          {
            id: "compose-service-db",
            kind: "compose-service",
            status: "running",
            ownerSessionId: "session-compose",
            metadata: {
              serviceId: "db",
              projectName: "board-test-compose"
            }
          }
        ]
      })
    );

    const result = await stopRuntime({
      repositoryRoot,
      sessionId: "session-compose",
      stateStore,
      stopCompose: async ({ projectName }) => {
        stops.push(projectName);
        return {
          id: "compose-stop",
          command: "docker",
          args: ["compose", "-p", projectName, "stop"],
          cwd: repositoryRoot,
          status: "succeeded",
          durationMs: 5
        };
      }
    });

    expect(stops).toEqual(["board-test-compose"]);
    expect(result).toMatchObject({
      ok: true,
      status: "stopped",
      stoppedResources: [
        expect.objectContaining({
          id: "compose-service-db",
          kind: "compose-service",
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
  readonly pid: number;
}): ManagedProcessRecord {
  return {
    pid: input.pid,
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
  return realpath(await mkdtemp(join(tmpdir(), `board-runtime-stop-${name}-`)));
}
