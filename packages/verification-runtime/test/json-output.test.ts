import { describe, expect, it } from "vitest";

import { serializeVerificationRunToJson } from "../src/index.js";

describe("@repo-knowledge/verification-runtime json output", () => {
  it("serializes a stable machine-readable shape", () => {
    const output = serializeVerificationRunToJson({
      schemaVersion: 1,
      runId: "verify_123",
      repositoryRoot: "/repo",
      contractPath: ".board/repository.yaml",
      contractVersion: "1",
      startedAt: "2026-08-23T00:00:00.000Z",
      completedAt: "2026-08-23T00:00:01.000Z",
      status: "passed",
      changeSet: {
        mode: "git",
        baseRef: "HEAD",
        headRef: "HEAD",
        paths: [],
        changedPaths: [],
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
          paths: [],
          changedPaths: [],
          warnings: []
        },
        selectedChecks: [],
        skippedChecks: [],
        warnings: []
      },
      results: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        timedOut: 0,
        skipped: 0,
        blocked: 0,
        notConfigured: 0,
        unknown: 0
      },
      warnings: [],
      errors: []
    });

    expect(output).toMatchObject({
      schema_version: 1,
      run_id: "verify_123",
      repository_root: "/repo",
      status: "passed"
    });
    expect(JSON.stringify(output)).toContain('"schema_version":1');
  });
});
