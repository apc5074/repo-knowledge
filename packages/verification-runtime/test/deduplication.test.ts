import { describe, expect, it } from "vitest";

import { deduplicateVerificationChecks, VerificationCheckConflictError } from "../src/index.js";

describe("@repo-knowledge/verification-runtime deduplication", () => {
  it("merges duplicate selections with the same definition", () => {
    const result = deduplicateVerificationChecks([
      {
        id: "lint",
        selected: true,
        source: "default",
        command: { command: "pnpm", args: ["lint"] },
        paths: [],
        components: [],
        requires: [],
        reason: { kind: "default", details: ["default"] }
      },
      {
        id: "lint",
        selected: true,
        source: "default",
        command: { command: "pnpm", args: ["lint"] },
        paths: [],
        components: [],
        requires: [],
        reason: { kind: "path", details: ["src/**"] }
      }
    ]);

    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.reason.details).toEqual(["default", "src/**"]);
  });

  it("rejects conflicting duplicate check definitions", () => {
    expect(() =>
      deduplicateVerificationChecks([
        {
          id: "lint",
          selected: true,
          source: "default",
          command: { command: "pnpm", args: ["lint"] },
          paths: [],
          components: [],
          requires: [],
          reason: { kind: "default", details: [] }
        },
        {
          id: "lint",
          selected: true,
          source: "default",
          command: { command: "pnpm", args: ["test"] },
          paths: [],
          components: [],
          requires: [],
          reason: { kind: "path", details: [] }
        }
      ])
    ).toThrow(VerificationCheckConflictError);
  });

  it("preserves the merged selection reason when duplicates come from multiple selectors", () => {
    const result = deduplicateVerificationChecks([
      {
        id: "lint",
        selected: true,
        source: "default",
        command: { command: "pnpm", args: ["lint"] },
        paths: [],
        components: [],
        requires: [],
        reason: { kind: "default", details: ["default"] }
      },
      {
        id: "lint",
        selected: true,
        source: "default",
        command: { command: "pnpm", args: ["lint"] },
        paths: [],
        components: [],
        requires: [],
        reason: { kind: "path", details: ["src/**"] }
      }
    ]);

    expect(result.checks[0]?.reason.details).toEqual(["default", "src/**"]);
  });
});
