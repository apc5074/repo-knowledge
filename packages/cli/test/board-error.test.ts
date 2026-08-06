import { describe, expect, it } from "vitest";

import {
  BoardError,
  boardErrorToResult,
  contractInvalidError,
  createCommandContext,
  exitCodes,
  unexpectedErrorToResult,
  usageError
} from "../src/index.js";

describe("BoardError", () => {
  it("creates operational errors with documented exit codes", () => {
    const error = usageError("Unknown flag.", ["Run board --help."]);

    expect(error).toBeInstanceOf(BoardError);
    expect(error.code).toBe("usage-error");
    expect(error.exitCode).toBe(exitCodes.usageError);
    expect(error.nextSteps).toEqual(["Run board --help."]);
  });

  it("formats contract issues without losing path detail", () => {
    const context = createCommandContext({ sessionId: "session-1" });
    const result = boardErrorToResult(
      context,
      "contract validate",
      contractInvalidError("Contract invalid.", ".board/repository.yaml", [
        {
          path: "repository.type",
          message: "Invalid repository type."
        }
      ])
    );

    expect(result.errors).toEqual([
      {
        code: "contract-invalid",
        message: "Contract invalid.",
        path: ".board/repository.yaml",
        details: [
          {
            path: "repository.type",
            message: "Invalid repository type."
          }
        ]
      },
      {
        code: "contract-issue",
        message: "repository.type: Invalid repository type.",
        path: "repository.type"
      }
    ]);
  });

  it("hides unexpected stack traces unless verbose is enabled", () => {
    const quietContext = createCommandContext({ sessionId: "session-1" });
    const verboseContext = createCommandContext({
      sessionId: "session-1",
      flags: {
        verbose: true
      }
    });

    expect(
      unexpectedErrorToResult(quietContext, "doctor", new Error("Boom")).errors[0]?.details
    ).toBeUndefined();
    expect(
      unexpectedErrorToResult(verboseContext, "doctor", new Error("Boom")).errors[0]?.details
    ).toBeDefined();
  });
});
