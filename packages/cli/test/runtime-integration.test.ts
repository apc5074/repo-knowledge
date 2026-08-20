import { describe, expect, it } from "vitest";

import {
  copyRuntimeFixtureRepository,
  createRepositoryFixture,
  createTempDirectory,
  parseJsonResult,
  runCli
} from "./harness.js";

describe("board runtime CLI integration", () => {
  it("previews startup in human mode without creating runtime state", async () => {
    const fixture = await copyRuntimeFixtureRepository("minimal-node-app");
    const dataRoot = await createTempDirectory("runtime-dry-run-data");
    const cacheRoot = await createTempDirectory("runtime-dry-run-cache");
    const result = await runCli(["start", "--dry-run"], {
      cwd: fixture.root,
      env: {
        BOARD_DATA_HOME: dataRoot,
        BOARD_CACHE_HOME: cacheRoot
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Built bootstrap runtime dry-run plan.");
    expect(result.stdout).toContain(
      "Next: Run board start without --dry-run to execute this plan."
    );
  });

  it("reports missing and invalid startup contracts in JSON mode", async () => {
    const missing = await createRepositoryFixture({
      name: "runtime-start-missing",
      contract: "missing"
    });
    const invalid = await copyRuntimeFixtureRepository("invalid-runtime-fields");

    const missingResult = await runCli(["start", "--json"], { cwd: missing.root });
    const invalidResult = await runCli(["start", "--json"], { cwd: invalid.root });

    expect(missingResult.exitCode).toBe(4);
    expect(parseJsonResult(missingResult)).toMatchObject({
      ok: false,
      command: "start",
      errors: [
        {
          code: "contract-not-found"
        }
      ]
    });
    const invalidPayload = parseJsonResult(invalidResult);

    expect(invalidResult.exitCode).toBe(5);
    expect(invalidPayload).toMatchObject({
      ok: false,
      command: "start"
    });
    expect(invalidPayload.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "contract-invalid"
        })
      ])
    );
  });

  it("starts, reports, and stops a fake local app process end to end", async () => {
    const fixture = await copyRuntimeFixtureRepository("minimal-node-app");
    const dataRoot = await createTempDirectory("runtime-start-data");
    const cacheRoot = await createTempDirectory("runtime-start-cache");
    const env = {
      BOARD_DATA_HOME: dataRoot,
      BOARD_CACHE_HOME: cacheRoot
    };

    try {
      const start = await runCli(["start", "--json"], {
        cwd: fixture.root,
        env
      });

      const startPayload = parseJsonResult<{
        readonly runtime: {
          readonly report: {
            readonly applications: readonly string[];
          };
        };
      }>(start);

      expect(start.exitCode).toBe(0);
      expect(startPayload).toMatchObject({
        ok: true,
        command: "start",
        data: {
          runtime: {
            status: "running",
            session: {
              status: "running"
            },
            report: {
              failedStepIds: []
            }
          }
        }
      });
      expect(startPayload.data.runtime.report.applications).toEqual(
        expect.arrayContaining(["api"])
      );

      const status = await runCli(["status", "--json"], {
        cwd: fixture.root,
        env
      });

      expect(status.exitCode).toBe(0);
      expect(parseJsonResult(status)).toMatchObject({
        ok: true,
        command: "status",
        data: {
          runtime: {
            available: true,
            status: "running",
            resources: expect.arrayContaining([
              expect.objectContaining({
                id: "process-application-api",
                kind: "process",
                status: "running"
              })
            ])
          }
        }
      });

      const stop = await runCli(["stop", "--json"], {
        cwd: fixture.root,
        env
      });

      expect(stop.exitCode).toBe(0);
      expect(parseJsonResult(stop)).toMatchObject({
        ok: true,
        command: "stop",
        data: {
          runtime: {
            status: "stopped",
            stopped_resources: [
              expect.objectContaining({
                id: "process-application-api",
                kind: "process",
                status: "stopped"
              })
            ]
          }
        }
      });
    } finally {
      await runCli(["stop", "--force", "--json"], {
        cwd: fixture.root,
        env
      });
    }
  });

  it("returns failed setup command output without leaving runtime processes", async () => {
    const fixture = await copyRuntimeFixtureRepository("failing-setup");
    const dataRoot = await createTempDirectory("runtime-failed-data");
    const cacheRoot = await createTempDirectory("runtime-failed-cache");
    const result = await runCli(["start", "--json"], {
      cwd: fixture.root,
      env: {
        BOARD_DATA_HOME: dataRoot,
        BOARD_CACHE_HOME: cacheRoot
      }
    });

    expect(result.exitCode).toBe(1);
    expect(parseJsonResult(result)).toMatchObject({
      ok: false,
      command: "start",
      data: {
        runtime: {
          status: "failed",
          session: {
            commandResults: [
              expect.objectContaining({
                id: "setup-install",
                status: "failed",
                stderrExcerpt: "install failed"
              })
            ]
          }
        }
      }
    });
  });

  it("reports no-session status and stop results clearly", async () => {
    const fixture = await copyRuntimeFixtureRepository("minimal-node-app");
    const dataRoot = await createTempDirectory("runtime-empty-data");
    const cacheRoot = await createTempDirectory("runtime-empty-cache");
    const env = {
      BOARD_DATA_HOME: dataRoot,
      BOARD_CACHE_HOME: cacheRoot
    };
    const status = await runCli(["status", "--json"], {
      cwd: fixture.root,
      env
    });
    const stop = await runCli(["stop", "--json"], {
      cwd: fixture.root,
      env
    });

    expect(status.exitCode).toBe(0);
    expect(parseJsonResult(status)).toMatchObject({
      ok: true,
      command: "status",
      status: "warning",
      data: {
        runtime: {
          available: true,
          status: "unknown",
          summary: "No runtime session has been recorded for this repository."
        }
      }
    });
    expect(stop.exitCode).toBe(1);
    expect(parseJsonResult(stop)).toMatchObject({
      ok: false,
      command: "stop",
      summary: "No Board-managed runtime session is available to stop."
    });
  });
});
