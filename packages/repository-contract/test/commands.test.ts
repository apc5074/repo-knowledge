import { describe, expect, it } from "vitest";

import { commandStepSchema, normalizeCommand } from "../src/index.js";

describe("command schema", () => {
  it("represents commands as executable name plus args without string parsing", () => {
    expect(
      commandStepSchema.parse({
        id: "test",
        command: "pnpm",
        args: ["test"],
        working_directory: ".",
        environment: ["DATABASE_URL"],
        timeout_seconds: 120,
        requires: ["install"],
        description: "Run unit tests."
      })
    ).toEqual({
      id: "test",
      command: "pnpm",
      args: ["test"],
      working_directory: ".",
      environment: ["DATABASE_URL"],
      timeout_seconds: 120,
      requires: ["install"],
      description: "Run unit tests.",
      optional: false,
      evidence: []
    });
  });

  it("normalizes simple string commands into command objects", () => {
    expect(normalizeCommand("pnpm install")).toEqual({
      command: "pnpm install",
      environment: [],
      requires: [],
      optional: false,
      evidence: []
    });
  });

  it("normalizes object commands through the schema", () => {
    expect(
      normalizeCommand({
        command: "pnpm",
        args: ["build"],
        shell: false
      })
    ).toEqual({
      command: "pnpm",
      args: ["build"],
      shell: false,
      environment: [],
      requires: [],
      optional: false,
      evidence: []
    });
  });

  it("requires optional commands to explain their optionality", () => {
    const result = commandStepSchema.safeParse({
      command: "pnpm seed",
      optional: true
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: ["optional_reason"],
        message: "optional_reason is required when a command is optional"
      }
    ]);
  });

  it("rejects invalid timeouts", () => {
    const result = commandStepSchema.safeParse({
      command: "pnpm test",
      timeout_seconds: 0
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["timeout_seconds"]);
  });
});
