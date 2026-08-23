import { describe, expect, it } from "vitest";

import { orderVerificationChecks, VerificationDependencyError } from "../src/index.js";

describe("@repo-knowledge/verification-runtime dependency ordering", () => {
  it("orders checks after their dependencies", () => {
    const result = orderVerificationChecks([
      {
        id: "test",
        selected: true,
        source: "rule-check",
        command: { command: "pnpm", args: ["test"] },
        paths: [],
        components: [],
        requires: ["lint"],
        reason: { kind: "rule", details: [] }
      },
      {
        id: "lint",
        selected: true,
        source: "default",
        command: { command: "pnpm", args: ["lint"] },
        paths: [],
        components: [],
        requires: [],
        reason: { kind: "default", details: [] }
      }
    ]);

    expect(result.checks.map((check) => check.id)).toEqual(["lint", "test"]);
  });

  it("fails on missing dependencies", () => {
    expect(() =>
      orderVerificationChecks([
        {
          id: "test",
          selected: true,
          source: "rule-check",
          command: { command: "pnpm", args: ["test"] },
          paths: [],
          components: [],
          requires: ["lint"],
          reason: { kind: "rule", details: [] }
        }
      ])
    ).toThrow(VerificationDependencyError);
  });

  it("fails on dependency cycles", () => {
    expect(() =>
      orderVerificationChecks([
        {
          id: "lint",
          selected: true,
          source: "default",
          command: { command: "pnpm", args: ["lint"] },
          paths: [],
          components: [],
          requires: ["test"],
          reason: { kind: "default", details: [] }
        },
        {
          id: "test",
          selected: true,
          source: "rule-check",
          command: { command: "pnpm", args: ["test"] },
          paths: [],
          components: [],
          requires: ["lint"],
          reason: { kind: "rule", details: [] }
        }
      ])
    ).toThrow(VerificationDependencyError);
  });
});
