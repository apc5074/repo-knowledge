import { describe, expect, it } from "vitest";

import { runVerificationCommand } from "../src/index.js";

describe("@repo-knowledge/verification-runtime command runner", () => {
  it("runs a successful command and captures output", async () => {
    const result = await runVerificationCommand({
      check: {
        id: "echo",
        source: "default",
        command: {
          command: process.execPath,
          args: ["-e", "console.log('ready')"]
        },
        paths: [],
        components: [],
        requires: [],
        reason: { kind: "default", details: [] }
      }
    });

    expect(result).toMatchObject({
      id: "echo",
      status: "passed"
    });
    expect(result.stdoutExcerpt).toContain("ready");
  });

  it("reports failed commands", async () => {
    const result = await runVerificationCommand({
      check: {
        id: "fail",
        source: "default",
        command: {
          command: process.execPath,
          args: ["-e", "console.error('failed'); process.exit(2)"]
        },
        paths: [],
        components: [],
        requires: [],
        reason: { kind: "default", details: [] }
      }
    });

    expect(result).toMatchObject({
      id: "fail",
      status: "failed",
      exitCode: 2
    });
    expect(result.stderrExcerpt).toContain("failed");
  });

  it("reports missing executables as failed commands", async () => {
    const result = await runVerificationCommand({
      check: {
        id: "missing",
        source: "default",
        command: {
          command: "definitely-not-a-real-board-command",
          args: []
        },
        paths: [],
        components: [],
        requires: [],
        reason: { kind: "default", details: [] }
      }
    });

    expect(result).toMatchObject({
      id: "missing",
      status: "failed",
      exitCode: 127
    });
  });

  it("marks truncated output excerpts", async () => {
    const result = await runVerificationCommand({
      maxOutputBytes: 16,
      check: {
        id: "large-output",
        source: "default",
        command: {
          command: process.execPath,
          args: ["-e", "console.log('abcdefghijklmnopqrstuvwxyz')"]
        },
        paths: [],
        components: [],
        requires: [],
        reason: { kind: "default", details: [] }
      }
    });

    expect(result.stdoutTruncated).toBe(true);
    expect(result.stdoutExcerpt?.length).toBeLessThanOrEqual(16);
  });

  it("reports timed out commands", async () => {
    const result = await runVerificationCommand({
      timeoutSeconds: 1,
      check: {
        id: "timeout",
        source: "default",
        command: {
          command: process.execPath,
          args: ["-e", "setTimeout(() => {}, 2000)"]
        },
        paths: [],
        components: [],
        requires: [],
        reason: { kind: "default", details: [] }
      }
    });

    expect(result).toMatchObject({
      id: "timeout",
      status: "timed_out",
      timedOut: true
    });
  });

  it("redacts known environment values in captured output", async () => {
    const result = await runVerificationCommand({
      env: {
        API_TOKEN: "secret-token-value"
      },
      check: {
        id: "redact",
        source: "default",
        command: {
          command: process.execPath,
          args: ["-e", "console.log(process.env.API_TOKEN)"],
          environment: ["API_TOKEN"]
        },
        paths: [],
        components: [],
        requires: [],
        reason: { kind: "default", details: [] }
      }
    });

    expect(result.stdoutExcerpt).toBe("[redacted]");
  });
});
