import { describe, expect, it } from "vitest";

import { buildCommandResult, printJsonResult } from "../src/index.js";

describe("JSON output printer", () => {
  it("prints one parseable JSON object for success output", () => {
    const result = buildCommandResult({
      ok: true,
      command: "version",
      summary: "0.0.0",
      data: {
        version: "0.0.0"
      },
      session_id: "session-1"
    });
    const output = printJsonResult(result);

    expect(JSON.parse(output)).toEqual({
      ok: true,
      status: "success",
      command: "version",
      summary: "0.0.0",
      data: {
        version: "0.0.0"
      },
      warnings: [],
      errors: [],
      next_steps: [],
      session_id: "session-1",
      review_items: [],
      candidate_findings: []
    });
    expect(output.trim().startsWith("{")).toBe(true);
    expect(output.trim().endsWith("}")).toBe(true);
  });

  it("prints parseable JSON for failure output", () => {
    const result = buildCommandResult({
      ok: false,
      command: "contract validate",
      summary: "Contract invalid",
      errors: [
        {
          code: "contract-invalid",
          message: "repository.type is invalid",
          path: "repository.type"
        }
      ],
      next_steps: ["Fix the contract and rerun validation."],
      session_id: "session-1"
    });

    expect(JSON.parse(printJsonResult(result))).toMatchObject({
      ok: false,
      status: "failure",
      errors: [
        {
          code: "contract-invalid",
          message: "repository.type is invalid"
        }
      ],
      next_steps: ["Fix the contract and rerun validation."]
    });
  });

  it("does not include ANSI color codes", () => {
    const result = buildCommandResult({
      ok: false,
      command: "doctor",
      summary: "\u001b[31mShould stay escaped text, not terminal color\u001b[0m",
      session_id: "session-1"
    });

    expect(printJsonResult(result)).not.toContain("\u001b[31m");
    expect(JSON.parse(printJsonResult(result)).summary).toContain("Should stay escaped text");
  });
});
