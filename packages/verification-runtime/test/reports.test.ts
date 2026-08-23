import { describe, expect, it } from "vitest";

import { formatVerificationRunReport } from "../src/index.js";

describe("@repo-knowledge/verification-runtime reports", () => {
  it("formats a concise human-readable report", () => {
    const report = formatVerificationRunReport({
      schemaVersion: 1,
      runId: "verify_123",
      repositoryRoot: "/repo",
      contractPath: ".board/repository.yaml",
      contractVersion: "1",
      startedAt: "2026-08-23T00:00:00.000Z",
      completedAt: "2026-08-23T00:00:01.000Z",
      status: "failed",
      changeSet: {
        mode: "git",
        baseRef: "HEAD",
        headRef: "HEAD",
        paths: ["src/app.ts"],
        changedPaths: ["src/app.ts"],
        warnings: []
      },
      plan: {
        mode: "git",
        contractPath: ".board/repository.yaml",
        baseRef: "HEAD",
        headRef: "HEAD",
        changeSet: {
          mode: "git",
          baseRef: "HEAD",
          headRef: "HEAD",
          paths: ["src/app.ts"],
          changedPaths: ["src/app.ts"],
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
      },
      results: [
        {
          id: "lint",
          status: "failed",
          source: "default",
          command: { command: "pnpm", args: ["lint"] },
          selectedBy: { kind: "default", details: [] },
          exitCode: 1,
          stdoutExcerpt: "oops",
          stderrExcerpt: "nope",
          evidence: []
        }
      ],
      summary: {
        total: 1,
        passed: 0,
        failed: 1,
        timedOut: 0,
        skipped: 0,
        blocked: 0,
        notConfigured: 0,
        unknown: 0
      },
      warnings: [],
      errors: ["lint failed"]
    });

    expect(report.summary).toContain("Verification failed");
    expect(report.human).toContain("Changed paths:");
    expect(report.human).toContain("Checks:");
  });
});
