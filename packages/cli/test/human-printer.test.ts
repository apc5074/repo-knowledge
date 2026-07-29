import { describe, expect, it } from "vitest";

import { buildCommandResult, printHumanResult } from "../src/index.js";

describe("human output printer", () => {
  it("prints concise success output", () => {
    const result = buildCommandResult({
      ok: true,
      command: "status",
      summary: "Repository ready",
      session_id: "session-1"
    });

    expect(printHumanResult(result)).toBe("Repository ready");
  });

  it("prints actionable failure output", () => {
    const result = buildCommandResult({
      ok: false,
      command: "contract validate",
      summary: "Could not load repository contract",
      errors: [
        {
          code: "contract-not-found",
          message: "Could not find .board/repository.yaml"
        }
      ],
      next_steps: ["Run board init to create .board/repository.yaml."],
      session_id: "session-1"
    });

    expect(printHumanResult(result)).toBe(
      [
        "Could not load repository contract",
        "Error: Could not find .board/repository.yaml",
        "Next: Run board init to create .board/repository.yaml."
      ].join("\n")
    );
  });

  it("suppresses successful output in quiet mode", () => {
    const result = buildCommandResult({
      ok: true,
      command: "status",
      summary: "Repository ready",
      session_id: "session-1"
    });

    expect(printHumanResult(result, { quiet: true })).toBe("");
  });

  it("adds safe diagnostic fields in verbose mode", () => {
    const result = buildCommandResult({
      ok: true,
      command: "contract validate",
      summary: "Valid repository contract",
      repository: {
        root: "/tmp/repo"
      },
      contract: {
        path: "/tmp/repo/.board/repository.yaml",
        valid: true
      },
      session_id: "session-1"
    });

    expect(printHumanResult(result, { verbose: true })).toContain("Session: session-1");
    expect(printHumanResult(result, { verbose: true })).toContain("Repository: /tmp/repo");
    expect(printHumanResult(result, { verbose: true })).not.toContain("process.env");
  });

  it("respects color and no-color output", () => {
    const result = buildCommandResult({
      ok: true,
      command: "status",
      summary: "Repository ready",
      session_id: "session-1"
    });

    expect(printHumanResult(result, { color: true })).toContain("\u001b[32m");
    expect(printHumanResult(result, { color: false })).not.toContain("\u001b[");
  });
});
