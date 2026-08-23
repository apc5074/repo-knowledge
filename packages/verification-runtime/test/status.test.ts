import { describe, expect, it } from "vitest";

import { classifyVerificationRunStatus } from "../src/index.js";

describe("@repo-knowledge/verification-runtime status classification", () => {
  it("treats failed and timed out results as failed runs", () => {
    expect(
      classifyVerificationRunStatus([
        {
          id: "lint",
          status: "passed",
          source: "default",
          evidence: []
        },
        {
          id: "test",
          status: "failed",
          source: "rule-check",
          evidence: []
        }
      ])
    ).toMatchObject({
      status: "failed",
      exitCode: 1
    });
  });

  it("treats empty runs as not configured without failing", () => {
    expect(classifyVerificationRunStatus([])).toMatchObject({
      status: "not_configured",
      exitCode: 0
    });
  });
});
