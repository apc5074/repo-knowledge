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

  it("selects default, path, and component checks from a shared fixture shape", () => {
    const result = selectVerificationChecks({
      mode: "git",
      changeSet: {
        mode: "git",
        changedPaths: ["src/api/example.ts", "src/core/example.ts"],
        paths: ["src/api/example.ts", "src/core/example.ts"],
        warnings: []
      },
      defaultChecks: [
        {
          id: "typecheck",
          source: "default",
          command: { command: "node", args: ["-e", "console.log('typecheck')"] },
          paths: [],
          components: [],
          requires: [],
          reason: { kind: "default", details: [] }
        }
      ],
      checks: [
        {
          id: "api-check",
          source: "rule-check",
          command: { command: "node", args: ["-e", "console.log('api')"] },
          paths: ["src/api/**"],
          components: [],
          requires: [],
          reason: { kind: "path", details: ["api-paths"] }
        },
        {
          id: "core-command",
          source: "rule-command",
          command: { command: "node", args: ["-e", "console.log('core')"] },
          paths: [],
          components: ["core"],
          requires: [],
          reason: { kind: "component", details: ["core-component"] }
        }
      ],
      requestedComponentIds: ["core"]
    });

    expect(result.selectedChecks.map((check) => check.id)).toEqual([
      "typecheck",
      "api-check",
      "core-command"
    ]);
  });

  it("supports all, skip, and no-default selection modes", () => {
    const result = selectVerificationChecks({
      mode: "checks",
      noDefault: true,
      changeSet: {
        mode: "checks",
        changedPaths: [],
        paths: [],
        warnings: []
      },
      checks: [
        {
          id: "lint",
          source: "default",
          command: { command: "node", args: ["-e", "console.log('lint')"] },
          paths: [],
          components: [],
          requires: [],
          reason: { kind: "default", details: [] }
        },
        {
          id: "test",
          source: "rule-check",
          command: { command: "node", args: ["-e", "console.log('test')"] },
          paths: [],
          components: [],
          requires: [],
          reason: { kind: "rule", details: ["rule"] }
        }
      ],
      requestedCheckIds: ["test"]
    });

    expect(result.selectedChecks.map((check) => check.id)).toEqual(["test"]);
    expect(result.selectedChecks[0]?.reason.kind).toBe("explicit");
  });

  it("allows explicit default checks when defaults are suppressed", () => {
    const result = selectVerificationChecks({
      mode: "git",
      noDefault: true,
      changeSet: {
        mode: "git",
        changedPaths: [],
        paths: [],
        warnings: []
      },
      defaultChecks: [
        {
          id: "lint",
          source: "default",
          command: { command: "node", args: ["-e", "console.log('lint')"] },
          paths: [],
          components: [],
          requires: [],
          reason: { kind: "default", details: [] }
        }
      ],
      checks: [],
      requestedCheckIds: ["lint"]
    });

    expect(result.selectedChecks).toEqual([
      expect.objectContaining({
        id: "lint",
        reason: { kind: "explicit", details: ["lint"] }
      })
    ]);
  });
});
