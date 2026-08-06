import { describe, expect, it } from "vitest";

import {
  buildSuccessResult,
  contractNotFoundError,
  createCommandContext,
  exitCodes,
  runCommand,
  runCommandSync
} from "../src/index.js";

describe("command runner", () => {
  it("normalizes successful command results", async () => {
    const events: string[] = [];
    const telemetryContext = createCommandContext({
      sessionId: "session-1",
      telemetry: {
        enabled: true,
        capture: (event) => {
          events.push(event);
        },
        flush: () => {
          events.push("flush");
        }
      }
    });
    const result = await runCommand({
      command: "status",
      context: telemetryContext,
      handler: () =>
        buildSuccessResult(telemetryContext, {
          command: "status",
          summary: "Repository ready"
        })
    });

    expect(result).toEqual({
      exitCode: exitCodes.success,
      stdout: expect.stringContaining("Repository ready"),
      stderr: ""
    });
    expect(events).toEqual(["command.completed", "flush"]);
  });

  it("formats known failures without stack traces", async () => {
    const context = createCommandContext({ sessionId: "session-1" });
    const result = await runCommand({
      command: "contract validate",
      context,
      handler: () => {
        throw contractNotFoundError(
          "Could not find repository contract.",
          ".board/repository.yaml"
        );
      }
    });

    expect(result.exitCode).toBe(exitCodes.contractNotFound);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Could not find repository contract.");
    expect(result.stderr).not.toContain("BoardError");
    expect(result.stderr).not.toContain("at ");
  });

  it("keeps failure output parseable in JSON mode", async () => {
    const context = createCommandContext({
      sessionId: "session-1",
      flags: {
        json: true
      }
    });
    const result = await runCommand({
      command: "contract validate",
      context,
      handler: () => {
        throw contractNotFoundError(
          "Could not find repository contract.",
          ".board/repository.yaml"
        );
      }
    });

    expect(result.exitCode).toBe(exitCodes.contractNotFound);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      command: "contract validate",
      errors: [
        {
          code: "contract-not-found"
        }
      ]
    });
  });

  it("formats unexpected failures with the internal error exit code", async () => {
    const context = createCommandContext({ sessionId: "session-1" });
    const result = await runCommand({
      command: "doctor",
      context,
      handler: () => {
        throw new Error("Boom");
      }
    });

    expect(result.exitCode).toBe(exitCodes.unexpectedInternalError);
    expect(result.stderr).toContain("Unexpected internal error.");
    expect(result.stderr).not.toContain("at ");
  });

  it("supports synchronous handlers through the same lifecycle", () => {
    const context = createCommandContext({ sessionId: "session-1" });
    const result = runCommandSync({
      command: "init",
      context,
      handler: () =>
        buildSuccessResult(context, {
          command: "init",
          summary: "Init placeholder"
        })
    });

    expect(result).toEqual({
      exitCode: exitCodes.success,
      stdout: "Init placeholder",
      stderr: ""
    });
  });
});
