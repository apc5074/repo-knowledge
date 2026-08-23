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
});
