import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseRepositoryContractObject } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import {
  bootstrapRuntimeToolMetadata,
  bootstrapRuntimeToolNames,
  createJsonRuntimeStateStore,
  getBootstrapRuntimeStatusTool,
  getBootstrapRuntimeToolMetadata,
  planBootstrapRuntimeTool,
  resolveRuntimeStateStorePaths,
  startBootstrapRuntimeTool,
  stopBootstrapRuntimeTool
} from "../src/index.js";

describe("agent-compatible bootstrap runtime tools", () => {
  it("exports stable metadata with policy, side effect, and redaction boundaries", () => {
    expect(bootstrapRuntimeToolNames).toEqual([
      "bootstrap.plan",
      "bootstrap.start",
      "bootstrap.status",
      "bootstrap.stop"
    ]);
    expect(bootstrapRuntimeToolMetadata).toHaveLength(4);
    expect(getBootstrapRuntimeToolMetadata("bootstrap.plan")).toMatchObject({
      localSideEffects: ["none"],
      policy: {
        requiresApproval: false,
        allowedForAgents: true
      }
    });
    expect(getBootstrapRuntimeToolMetadata("bootstrap.start")).toMatchObject({
      localSideEffects: expect.arrayContaining(["local-command-execution", "local-process-start"]),
      policy: {
        requiresApproval: true,
        allowedForAgents: true
      },
      inputSchema: "StartRuntimeInput",
      outputSchema: "StartRuntimeResult"
    });
    expect(getBootstrapRuntimeToolMetadata("bootstrap.stop").redactionGuarantees).toEqual(
      expect.arrayContaining(["Stops only resources recorded in Board runtime state."])
    );
  });

  it("plans bootstrap without local side effects and returns JSON-safe output", async () => {
    const result = await planBootstrapRuntimeTool({
      repositoryRoot: "/repo",
      contract: parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "tool-plan",
          type: "service",
          primary_language: "typescript"
        }
      })
    });

    expect(result).toMatchObject({
      toolName: "bootstrap.plan",
      ok: true,
      metadata: {
        localSideEffects: ["none"]
      },
      result: {
        status: "pending",
        plan: {
          repositoryRoot: "/repo"
        }
      }
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("wraps start, status, and stop without depending on CLI", async () => {
    const repositoryRoot = await tempRoot("tool-runtime");
    const stateStore = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot("tool-state")
      })
    );
    const contract = parseRepositoryContractObject({
      version: 1,
      repository: {
        name: "tool-runtime",
        type: "service",
        primary_language: "typescript"
      },
      setup: {
        install: {
          command: process.execPath,
          args: ["-e", "console.log(process.env.API_TOKEN)"],
          environment: ["API_TOKEN"]
        }
      }
    });

    const start = await startBootstrapRuntimeTool(
      {
        repositoryRoot,
        contract,
        sessionId: "tool-session"
      },
      {
        stateStore,
        env: {
          API_TOKEN: "secret-value-123"
        }
      }
    );

    expect(start).toMatchObject({
      toolName: "bootstrap.start",
      ok: true,
      result: {
        session: {
          id: "tool-session",
          status: "succeeded",
          commandResults: [
            expect.objectContaining({
              stdoutExcerpt: "[redacted]"
            })
          ]
        }
      }
    });
    expect(JSON.stringify(start)).not.toContain("secret-value-123");

    await expect(
      getBootstrapRuntimeStatusTool(
        {
          repositoryRoot
        },
        {
          stateStore
        }
      )
    ).resolves.toMatchObject({
      toolName: "bootstrap.status",
      result: {
        session: {
          id: "tool-session"
        }
      }
    });

    await expect(
      stopBootstrapRuntimeTool(
        {
          repositoryRoot
        },
        {
          stateStore
        }
      )
    ).resolves.toMatchObject({
      toolName: "bootstrap.stop",
      result: {
        stoppedSessionIds: ["tool-session"]
      }
    });
  });
});

async function tempRoot(name: string): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), `board-runtime-tools-${name}-`)));
}
