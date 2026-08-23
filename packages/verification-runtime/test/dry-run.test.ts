import { describe, expect, it } from "vitest";

import { createVerificationDryRunReport } from "../src/index.js";

describe("@repo-knowledge/verification-runtime dry run", () => {
  it("prints a concise dry-run summary", () => {
    const report = createVerificationDryRunReport({
      mode: "git",
      contractPath: ".board/repository.yaml",
      changeSet: {
        mode: "git",
        changedPaths: ["src/app.ts"],
        paths: ["src/app.ts"],
        warnings: []
      },
      selectedChecks: [
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
      ],
      skippedChecks: [],
      warnings: []
    });

    expect(report.summary).toContain("Selected 1 verification checks.");
    expect(report.human).toContain("Mode: git");
  });
});
