import { parseRepositoryContractObject } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import {
  buildBootstrapPlan,
  runRuntimeHealthChecks,
  type RuntimeCommandResult
} from "../src/index.js";

describe("runtime health checks", () => {
  it("passes healthy local URL checks", async () => {
    const url = "http://127.0.0.1:3000/health";
    const plan = healthPlan({ url });

    await expect(
      runRuntimeHealthChecks({
        plan,
        retries: 0,
        fetchUrl: async () => ({
          status: "succeeded",
          statusCode: 200,
          outputExcerpt: "HTTP 200"
        })
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: "application-health-api",
        target: url,
        status: "succeeded",
        statusCode: 200,
        outputExcerpt: "HTTP 200"
      })
    ]);
  });

  it("fails unreachable URL checks clearly", async () => {
    const url = "http://127.0.0.1:3999/health";
    const plan = healthPlan({ url });

    await expect(
      runRuntimeHealthChecks({
        plan,
        retries: 0,
        fetchUrl: async () => ({
          status: "failed",
          outputExcerpt: "connect ECONNREFUSED 127.0.0.1:3999"
        })
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: "application-health-api",
        target: url,
        status: "failed",
        outputExcerpt: "connect ECONNREFUSED 127.0.0.1:3999"
      })
    ]);
  });

  it("captures command health check exit codes and output", async () => {
    const plan = healthPlan({
      command: {
        command: "node",
        args: ["-e", "console.log('healthy')"]
      }
    });
    const result = await runRuntimeHealthChecks({
      plan,
      runCommand: async ({ id }) =>
        ({
          id,
          command: "node",
          args: [],
          cwd: "/repo",
          status: "succeeded",
          exitCode: 0,
          stdoutExcerpt: "healthy"
        }) satisfies RuntimeCommandResult
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: "application-health-api",
        target: "node",
        status: "succeeded",
        outputExcerpt: "healthy"
      })
    ]);
  });

  it("retries URL checks until one succeeds", async () => {
    const plan = healthPlan({
      url: "http://127.0.0.1:9999/health"
    });
    let attempts = 0;
    const result = await runRuntimeHealthChecks({
      plan,
      retries: 2,
      fetchUrl: async () => {
        attempts += 1;
        return {
          status: attempts === 3 ? "succeeded" : "failed",
          statusCode: attempts === 3 ? 200 : 503,
          outputExcerpt: `attempt ${attempts}`
        };
      }
    });

    expect(attempts).toBe(3);
    expect(result).toEqual([
      expect.objectContaining({
        status: "succeeded",
        statusCode: 200,
        outputExcerpt: "attempt 3"
      })
    ]);
  });

  it("can skip all health checks", async () => {
    const plan = healthPlan({
      url: "http://127.0.0.1:9999/health"
    });

    await expect(runRuntimeHealthChecks({ plan, enabled: false })).resolves.toEqual([
      {
        id: "application-health-api",
        target: "http://127.0.0.1:9999/health",
        status: "skipped",
        outputExcerpt: "Health checks were skipped by runtime options."
      }
    ]);
  });
});

function healthPlan(input: {
  readonly url?: string;
  readonly command?: {
    readonly command: string;
    readonly args?: readonly string[];
  };
}) {
  return buildBootstrapPlan({
    repositoryRoot: "/repo",
    contract: parseRepositoryContractObject({
      version: 1,
      repository: {
        name: "health-fixture",
        type: "service",
        primary_language: "typescript"
      },
      applications: {
        api: {
          id: "api",
          type: "api",
          health_check: {
            url: input.url,
            command: input.command
          }
        }
      }
    })
  }).plan;
}
