import { describe, expect, it } from "vitest";

import { buildSuccessResult, runCommand } from "../src/index.js";
import {
  createHarnessContext,
  createRepositoryFixture,
  parseJsonResult,
  runCli
} from "./harness.js";

describe("CLI test harness", () => {
  it("runs CLI commands in-process with fixture cwd and JSON parsing", async () => {
    const fixture = await createRepositoryFixture({
      name: "harness-status",
      contract: "valid"
    });
    const result = await runCli(["status"], {
      cwd: fixture.root,
      json: true
    });

    expect(result.exitCode).toBe(0);
    expect(parseJsonResult(result)).toMatchObject({
      ok: true,
      command: "status",
      data: {
        repository: {
          root: fixture.root
        }
      }
    });
  });

  it("creates deterministic command contexts for handler-level tests", async () => {
    const context = createHarnessContext({
      flags: {
        json: true
      },
      env: {
        BOARD_TELEMETRY: "true"
      }
    });
    const result = await runCommand({
      command: "status",
      context,
      handler: () =>
        buildSuccessResult(context, {
          command: "status",
          summary: "Harness command"
        })
    });

    expect(context.sessionId).toBe("local-00000000-0000-4000-8000-000000000001");
    expect(context.telemetry.enabled).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(parseJsonResult(result)).toMatchObject({
      ok: true,
      command: "status",
      summary: "Harness command"
    });
  });
});
