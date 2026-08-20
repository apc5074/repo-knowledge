import { describe, expect, it } from "vitest";

import { formatStartRuntimeReport, type StartRuntimeResult } from "../src/index.js";

describe("runtime report formatting", () => {
  it("summarizes runtime state without raw command log excerpts", () => {
    const report = formatStartRuntimeReport({
      ok: false,
      status: "failed",
      summary: "Bootstrap runtime recorded a failed startup.",
      warnings: [],
      errors: ["setup-install failed."],
      nextSteps: ["Inspect failed steps, fix the local issue, then rerun board start."],
      plan: {
        repositoryRoot: "/tmp/repo",
        dryRun: false,
        steps: [],
        resources: [],
        prerequisites: [],
        warnings: []
      },
      session: {
        id: "session-report",
        repositoryRoot: "/tmp/repo",
        status: "failed",
        startedAt: "2026-08-20T00:00:00.000Z",
        completedAt: "2026-08-20T00:00:02.000Z",
        steps: [
          {
            id: "load-contract",
            kind: "load-contract",
            title: "Load contract",
            status: "succeeded",
            summary: "Loaded.",
            dependsOn: []
          },
          {
            id: "setup-install",
            kind: "setup",
            title: "Install dependencies",
            status: "failed",
            summary: "Install failed.",
            dependsOn: ["load-contract"]
          }
        ],
        resources: [
          {
            id: "port-api-3000",
            kind: "port",
            status: "failed",
            ownerSessionId: "session-report",
            metadata: {
              ownerId: "api",
              host: "127.0.0.1",
              port: 3000
            }
          }
        ],
        commandResults: [
          {
            id: "setup-install",
            command: "npm",
            args: ["install"],
            cwd: "/tmp/repo",
            status: "failed",
            durationMs: 25,
            stderrExcerpt: "TOKEN=secret-value"
          }
        ],
        healthCheckResults: [
          {
            id: "application-health-api",
            target: "node",
            status: "failed",
            elapsedMs: 10
          }
        ],
        warnings: [],
        errors: ["setup-install failed."]
      }
    } satisfies StartRuntimeResult);

    expect(report.summary).toContain("Runtime session session-report is failed.");
    expect(report.details).toMatchObject({
      sessionId: "session-report",
      steps: {
        total: 2,
        succeeded: 1,
        failed: 1
      },
      resources: {
        total: 1,
        failed: 1
      },
      failedStepIds: ["setup-install"],
      failedResourceIds: ["port-api-3000"],
      durations: {
        sessionMs: 2000,
        commandMs: 25,
        healthCheckMs: 10
      }
    });
    expect(JSON.stringify(report.details)).not.toContain("secret-value");
    expect(report.human).toContain("Failed steps: setup-install");
  });
});
