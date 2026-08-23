import { describe, expect, it } from "vitest";

import { normalizeVerificationChecks } from "../src/index.js";

describe("@repo-knowledge/verification-runtime check normalization", () => {
  it("turns rule commands into deterministic synthetic checks", () => {
    const result = normalizeVerificationChecks({
      mode: "git",
      rules: [
        {
          id: "api",
          description: "API checks",
          paths: ["apps/api/**"],
          commands: [
            {
              command: "pnpm",
              args: ["test"],
              description: "Run API tests"
            }
          ]
        }
      ]
    });

    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]).toMatchObject({
      id: "api:command:0",
      source: "rule-command",
      ruleId: "api",
      command: {
        command: "pnpm",
        args: ["test"]
      }
    });
  });

  it("inherits rule paths and components for nested checks", () => {
    const result = normalizeVerificationChecks({
      mode: "git",
      rules: [
        {
          id: "api",
          paths: ["apps/api/**"],
          components: ["api"],
          checks: [
            {
              id: "api-test",
              command: {
                command: "pnpm",
                args: ["test"]
              }
            }
          ]
        }
      ]
    });

    expect(result.checks[0]).toMatchObject({
      id: "api-test",
      paths: ["apps/api/**"],
      components: ["api"]
    });
  });
});
