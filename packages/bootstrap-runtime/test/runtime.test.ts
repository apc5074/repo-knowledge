import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseRepositoryContractObject } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import {
  createJsonRuntimeStateStore,
  resolveRuntimeStateStorePaths,
  startRuntime
} from "../src/index.js";

describe("startup orchestrator", () => {
  it("returns a dry-run plan without writing runtime state", async () => {
    const repositoryRoot = await tempRoot("dry-run");
    const stateStore = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot("dry-state")
      })
    );

    const result = await startRuntime({
      repositoryRoot,
      stateStore,
      dryRun: true,
      contract: parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "dry-run-fixture",
          type: "service",
          primary_language: "typescript"
        }
      })
    });

    expect(result).toMatchObject({
      ok: true,
      status: "pending",
      plan: {
        dryRun: true
      }
    });
    expect(result.session).toBeUndefined();
    await expect(stateStore.readLatestSession()).resolves.toBeUndefined();
  });

  it("records successful startup state from contract-defined setup commands", async () => {
    const repositoryRoot = await tempRoot("success");
    const stateStore = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot("success-state")
      })
    );

    const result = await startRuntime({
      repositoryRoot,
      stateStore,
      sessionId: "session-success",
      contract: parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "success-fixture",
          type: "service",
          primary_language: "typescript"
        },
        setup: {
          install: {
            command: process.execPath,
            args: ["-e", "console.log('installed')"]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: true,
      status: "succeeded",
      session: {
        id: "session-success",
        status: "succeeded",
        commandResults: [
          expect.objectContaining({
            id: "setup-install",
            status: "succeeded",
            stdoutExcerpt: "installed"
          })
        ]
      }
    });
    await expect(stateStore.readLatestSession()).resolves.toMatchObject({
      id: "session-success",
      status: "succeeded"
    });
  });

  it("preserves failed setup state for later status inspection", async () => {
    const repositoryRoot = await tempRoot("failed");
    const stateStore = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot("failed-state")
      })
    );

    const result = await startRuntime({
      repositoryRoot,
      stateStore,
      sessionId: "session-failed",
      contract: parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "failed-fixture",
          type: "service",
          primary_language: "typescript"
        },
        setup: {
          install: {
            command: process.execPath,
            args: ["-e", "console.error('broken'); process.exit(2)"]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      session: {
        id: "session-failed",
        status: "failed",
        errors: ["setup-install failed."]
      }
    });
    await expect(stateStore.readSession("session-failed")).resolves.toMatchObject({
      status: "failed",
      commandResults: [
        expect.objectContaining({
          id: "setup-install",
          status: "failed",
          exitCode: 2,
          stderrExcerpt: "broken"
        })
      ]
    });
  });

  it("records interrupted startup state for later status and stop cleanup", async () => {
    const repositoryRoot = await tempRoot("interrupted");
    const stateStore = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot("interrupted-state")
      })
    );
    const abortController = new AbortController();

    abortController.abort("SIGINT received.");
    const result = await startRuntime({
      repositoryRoot,
      stateStore,
      sessionId: "session-interrupted",
      interruptSignal: abortController.signal,
      contract: parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "interrupted-fixture",
          type: "service",
          primary_language: "typescript"
        },
        setup: {
          install: {
            command: process.execPath,
            args: ["-e", "console.log('should not run')"]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "interrupted",
      summary: "Bootstrap runtime startup was interrupted; cleanup was attempted.",
      errors: ["SIGINT received."],
      session: {
        id: "session-interrupted",
        status: "interrupted",
        steps: expect.arrayContaining([
          expect.objectContaining({
            id: "load-contract",
            status: "succeeded"
          }),
          expect.objectContaining({
            id: "inspect-prerequisites",
            status: "interrupted"
          }),
          expect.objectContaining({
            id: "setup-install",
            status: "skipped"
          })
        ])
      }
    });
    await expect(stateStore.readSession("session-interrupted")).resolves.toMatchObject({
      status: "interrupted",
      commandResults: []
    });
  });
});

async function tempRoot(name: string): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), `board-runtime-orchestrator-${name}-`)));
}
