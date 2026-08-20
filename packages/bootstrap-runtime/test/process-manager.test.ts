import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseRepositoryContractObject } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import {
  buildBootstrapPlan,
  createJsonRuntimeStateStore,
  getManagedProcessStatus,
  resolveRuntimeStateStorePaths,
  startApplicationProcesses,
  startManagedProcess,
  stopManagedProcess,
  type ManagedProcessRecord
} from "../src/index.js";

describe("local process manager", () => {
  it("starts, stores, reports, and stops a Board-managed app process", async () => {
    const repositoryRoot = await tempRoot("running");
    const store = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot("state")
      })
    );
    const plan = buildBootstrapPlan({
      repositoryRoot,
      contract: parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "process-fixture",
          type: "service",
          primary_language: "typescript"
        },
        applications: {
          api: {
            id: "api",
            type: "api",
            dev: {
              command: process.execPath,
              args: ["-e", "console.log('ready'); setTimeout(() => {}, 10000)"]
            }
          }
        }
      })
    }).plan;
    const result = await startApplicationProcesses({
      plan,
      sessionId: "session-1",
      repositoryRoot,
      stateStore: store,
      earlyExitMs: 100
    });
    const processRecord = result.processes[0];

    try {
      expect(result).toMatchObject({
        status: "running",
        resources: [
          expect.objectContaining({
            kind: "process",
            status: "running",
            ownerSessionId: "session-1"
          })
        ],
        commandResults: [
          expect.objectContaining({
            id: "application-api",
            status: "running",
            stdoutExcerpt: "ready"
          })
        ]
      });
      expect(processRecord).toEqual(
        expect.objectContaining({
          sessionId: "session-1",
          repositoryRoot,
          applicationId: "api",
          command: process.execPath,
          stdoutExcerpt: "ready"
        })
      );
      await expect(store.readProcesses()).resolves.toEqual([
        expect.objectContaining({
          pid: processRecord?.pid,
          resourceId: "process-application-api"
        })
      ]);
      expect(getManagedProcessStatus(processRecord as ManagedProcessRecord)).toMatchObject({
        status: "running",
        ownerSessionId: "session-1"
      });
    } finally {
      if (processRecord !== undefined) {
        await stopManagedProcess({ record: processRecord, stateStore: store, force: true });
      }
    }

    await expect(store.readProcesses()).resolves.toEqual([]);
  });

  it("captures early exits as failed starts without registering a PID", async () => {
    const repositoryRoot = await tempRoot("early-exit");
    const store = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot("early-state")
      })
    );
    const step = buildBootstrapPlan({
      repositoryRoot,
      contract: parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "early-exit-fixture",
          type: "service",
          primary_language: "typescript"
        },
        applications: {
          api: {
            id: "api",
            type: "api",
            dev: {
              command: process.execPath,
              args: ["-e", "console.error(`API_TOKEN=${process.env.API_TOKEN}`); process.exit(2)"],
              environment: ["API_TOKEN"]
            }
          }
        }
      })
    }).plan.steps.find((candidate) => candidate.id === "application-api");

    if (step === undefined) {
      throw new Error("application step missing");
    }

    const result = await startManagedProcess({
      sessionId: "session-2",
      repositoryRoot,
      step,
      stateStore: store,
      earlyExitMs: 100,
      environment: {
        variables: [],
        values: {
          API_TOKEN: "secret-token-value"
        },
        missingRequiredNames: [],
        missingOptionalNames: [],
        blockedStepIds: [],
        warnings: [],
        errors: []
      }
    });

    expect(result.process).toBeUndefined();
    expect(result).toMatchObject({
      status: "failed",
      commandResult: {
        status: "failed",
        exitCode: 2,
        stderrExcerpt: "API_TOKEN=[redacted]"
      },
      errors: ["application-api exited before it could be tracked."]
    });
    expect(JSON.stringify(result)).not.toContain("secret-token-value");
    await expect(store.readProcesses()).resolves.toEqual([]);
  });

  it("skips app process starts blocked by missing environment", async () => {
    const repositoryRoot = await tempRoot("blocked");
    const step = buildBootstrapPlan({
      repositoryRoot,
      contract: parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "blocked-fixture",
          type: "service",
          primary_language: "typescript"
        },
        applications: {
          api: {
            id: "api",
            type: "api",
            dev: {
              command: process.execPath,
              args: ["-e", "setTimeout(() => {}, 10000)"],
              environment: ["DATABASE_URL"]
            }
          }
        }
      })
    }).plan.steps.find((candidate) => candidate.id === "application-api");

    if (step === undefined) {
      throw new Error("application step missing");
    }

    await expect(
      startManagedProcess({
        sessionId: "session-3",
        repositoryRoot,
        step,
        environment: {
          variables: [],
          values: {},
          missingRequiredNames: ["DATABASE_URL"],
          missingOptionalNames: [],
          blockedStepIds: ["application-api"],
          warnings: [],
          errors: []
        }
      })
    ).resolves.toMatchObject({
      status: "skipped",
      step: {
        status: "skipped"
      },
      warnings: ["application-api skipped: Required environment is missing."]
    });
  });
});

async function tempRoot(name: string): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), `board-runtime-process-${name}-`)));
}
