import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runRuntimeCommand, type RuntimePlannedCommand } from "../src/index.js";

describe("safe runtime command runner", () => {
  it("runs commands with args in the configured working directory", async () => {
    const cwd = await tempRoot("cwd");
    const result = await runRuntimeCommand({
      id: "cwd-check",
      command: nodeCommand(cwd, [
        "-e",
        "console.log(JSON.stringify({ cwd: process.cwd(), arg: process.argv[1] }))",
        "hello"
      ])
    });

    expect(result).toMatchObject({
      id: "cwd-check",
      command: process.execPath,
      args: [
        "-e",
        "console.log(JSON.stringify({ cwd: process.cwd(), arg: process.argv[1] }))",
        "hello"
      ],
      cwd,
      status: "succeeded",
      exitCode: 0,
      timedOut: false
    });
    expect(result.stdoutExcerpt).toContain(`"cwd":"${cwd}"`);
    expect(result.stdoutExcerpt).toContain('"arg":"hello"');
  });

  it("captures failed exit codes and stderr excerpts", async () => {
    const cwd = await tempRoot("failure");
    const result = await runRuntimeCommand({
      id: "failure",
      command: nodeCommand(cwd, ["-e", "console.error('bad path'); process.exit(7)"])
    });

    expect(result).toMatchObject({
      status: "failed",
      exitCode: 7,
      stderrExcerpt: "bad path"
    });
  });

  it("terminates timed-out commands", async () => {
    const cwd = await tempRoot("timeout");
    const result = await runRuntimeCommand({
      id: "timeout",
      command: nodeCommand(cwd, ["-e", "setTimeout(() => {}, 5000)"], 1),
      timeoutSeconds: 1
    });

    expect(result).toMatchObject({
      status: "timed_out",
      timedOut: true
    });
  });

  it("passes selected environment variables without persisting their values", async () => {
    const cwd = await tempRoot("env");
    const result = await runRuntimeCommand({
      id: "env",
      env: {
        API_TOKEN: "secret-value-123"
      },
      command: {
        ...nodeCommand(cwd, ["-e", "console.log(process.env.API_TOKEN)"]),
        environment: ["API_TOKEN"]
      }
    });

    expect(result.stdoutExcerpt).toBe("[redacted]");
    expect(JSON.stringify(result)).not.toContain("secret-value-123");
  });

  it("does not pass unselected environment variables to child commands", async () => {
    const cwd = await tempRoot("unselected-env");
    const result = await runRuntimeCommand({
      id: "unselected-env",
      env: {
        SELECTED_TOKEN: "selected-secret",
        UNSELECTED_TOKEN: "unselected-secret"
      },
      command: {
        ...nodeCommand(cwd, [
          "-e",
          "console.log(`${process.env.SELECTED_TOKEN ?? ''}:${process.env.UNSELECTED_TOKEN ?? ''}`)"
        ]),
        environment: ["SELECTED_TOKEN"]
      }
    });

    expect(result.stdoutExcerpt).toBe("[redacted]:");
    expect(JSON.stringify(result)).not.toContain("selected-secret");
    expect(JSON.stringify(result)).not.toContain("unselected-secret");
  });

  it("keeps bounded output excerpts", async () => {
    const cwd = await tempRoot("bounded");
    const result = await runRuntimeCommand({
      id: "bounded",
      maxOutputBytes: 12,
      command: nodeCommand(cwd, ["-e", "console.log('abcdefghijklmnopqrstuvwxyz')"])
    });

    expect(result.stdoutExcerpt?.length).toBeLessThanOrEqual(12);
    expect(result.stdoutExcerpt).toContain("z");
  });
});

function nodeCommand(
  cwd: string,
  args: readonly string[],
  timeoutSeconds?: number
): RuntimePlannedCommand {
  return {
    command: process.execPath,
    args,
    cwd,
    shell: false,
    environment: [],
    timeoutSeconds,
    optional: false
  };
}

async function tempRoot(name: string): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), `board-runtime-command-${name}-`)));
}
