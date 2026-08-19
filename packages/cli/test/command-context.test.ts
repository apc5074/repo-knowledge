import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  createBoardProgram,
  createCommandContext,
  createCommandContextFromCommand,
  isBoardIdentifier
} from "../src/index.js";

describe("command context", () => {
  it("builds context for commands that do not require a repository", async () => {
    const context = createCommandContext({
      currentWorkingDirectory: "/tmp/current",
      flags: {
        json: true,
        quiet: true,
        verbose: true,
        config: ".board/custom.yaml",
        color: false
      },
      sessionId: "session-1",
      agent: {
        agentRunId: "agent-run-1",
        toolCallId: "tool-call-1",
        approvalId: "approval-1"
      }
    });

    expect(context.currentWorkingDirectory).toBe("/tmp/current");
    expect(context.startDirectory).toBe("/tmp/current");
    expect(context.outputMode).toBe("json");
    expect(context.globalFlags).toMatchObject({
      json: true,
      quiet: true,
      verbose: true,
      config: ".board/custom.yaml",
      color: false
    });
    await expect(context.contractPath()).resolves.toMatchObject({
      ok: false,
      reason: "contract-not-found"
    });
    await expect(context.localState()).resolves.toMatchObject({
      dataRoot: expect.stringContaining("board"),
      cacheRoot: expect.stringContaining("board")
    });
    expect(context.sessionId).toBe("session-1");
    expect(context.agent).toEqual({
      agentRunId: "agent-run-1",
      toolCallId: "tool-call-1",
      approvalId: "approval-1"
    });
    expect(context.telemetry.enabled).toBe(false);
  });

  it("creates a local session id when one is not provided", () => {
    const context = createCommandContext();

    expect(context.sessionId).toMatch(/^local-/);
    expect(isBoardIdentifier(context.sessionId)).toBe(true);
  });

  it("can enable the no-op telemetry client from the environment", () => {
    const context = createCommandContext({
      env: {
        BOARD_TELEMETRY: "true"
      }
    });

    expect(context.telemetry.enabled).toBe(true);
  });

  it("uses --cwd as the repository discovery start directory", async () => {
    const root = await createDirectory("context-root");
    const nested = join(root, "packages/cli");

    await mkdir(join(root, ".git"), { recursive: true });
    await mkdir(nested, { recursive: true });

    const context = createCommandContext({
      currentWorkingDirectory: tmpdir(),
      flags: {
        cwd: nested
      }
    });

    await expect(context.repositoryRoot()).resolves.toEqual({
      ok: true,
      root,
      foundBy: "git",
      startDirectory: nested
    });
  });

  it("can be constructed from a Commander command", () => {
    let context = createCommandContext();
    const program = createBoardProgram({
      onResult: () => {}
    });
    const initCommand = program.commands.find((command) => command.name() === "init");

    if (initCommand === undefined) {
      throw new Error("Expected init command to be registered");
    }

    initCommand.action(() => {
      context = createCommandContextFromCommand(initCommand);
    });

    program.exitOverride();
    program.parse(["--json", "--cwd", "/tmp/repo", "init"], { from: "user" });

    expect(context.outputMode).toBe("json");
    expect(context.startDirectory).toBe("/tmp/repo");
  });
});

async function createDirectory(name: string): Promise<string> {
  const directory = join(tmpdir(), `board-cli-${name}-${randomUUID()}`);

  await mkdir(directory, { recursive: true });

  return directory;
}
