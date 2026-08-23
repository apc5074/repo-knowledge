import { describe, expect, it } from "vitest";

import { selectVerificationChecks } from "../src/index.js";

describe("@repo-knowledge/verification-runtime selector", () => {
  it("selects explicit and path-matched checks", () => {
    const result = selectVerificationChecks({
      mode: "git",
      noDefault: true,
      changeSet: {
        mode: "git",
        changedPaths: ["docs/notes.md"],
        paths: ["docs/notes.md"],
        warnings: []
      },
      checks: [
        {
          id: "lint-api",
          source: "default",
          command: { command: "pnpm", args: ["lint"] },
          paths: ["apps/api/**"],
          components: ["api"],
          requires: [],
          reason: { kind: "default", details: [] }
        },
        {
          id: "test-api",
          source: "rule-check",
          command: { command: "pnpm", args: ["test"] },
          paths: ["apps/api/**"],
          components: ["api"],
          requires: [],
          reason: { kind: "path", details: ["apps/api/**"] }
        }
      ],
      requestedCheckIds: ["test-api"]
    });

    expect(result.selectedChecks.map((check) => check.id)).toEqual(["test-api"]);
    expect(result.selectedChecks[0]?.reason.kind).toBe("explicit");
  });
});
