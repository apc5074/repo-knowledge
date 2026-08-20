import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseRepositoryContractObject } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import {
  defaultRuntimeBudget,
  resolveRuntimeBudget,
  runSetupSteps,
  startApplicationProcesses,
  startRuntime,
  type BootstrapPlan,
  type RuntimeStep
} from "../src/index.js";

describe("runtime performance and timeout budget", () => {
  it("defines stable runtime budget defaults and validates overrides", () => {
    expect(defaultRuntimeBudget).toEqual({
      commandTimeoutSeconds: 120,
      healthCheckTimeoutMs: 5000,
      startupTimeoutSeconds: 600,
      outputExcerptBytes: 8192,
      maxSetupSteps: 25,
      maxTrackedProcesses: 8,
      processReadyProbeMs: 500
    });
    expect(
      resolveRuntimeBudget({
        commandTimeoutSeconds: 3,
        startupTimeoutSecondsOverride: 9,
        outputExcerptBytes: -1
      })
    ).toMatchObject({
      commandTimeoutSeconds: 3,
      startupTimeoutSeconds: 9,
      outputExcerptBytes: defaultRuntimeBudget.outputExcerptBytes
    });
  });

  it("passes default command timeout and excerpt limits into setup commands", async () => {
    const calls: unknown[] = [];
    const plan = budgetPlan([
      setupStep("setup-one"),
      setupStep("setup-two"),
      setupStep("setup-three")
    ]);
    const result = await runSetupSteps({
      plan,
      defaultTimeoutSeconds: 7,
      maxOutputBytes: 11,
      maxSetupSteps: 2,
      runCommand: async (input) => {
        calls.push(input);
        return {
          id: input.id,
          command: input.command.command,
          args: input.command.args,
          cwd: input.command.cwd,
          status: "succeeded",
          exitCode: 0,
          durationMs: 5
        };
      }
    });

    expect(calls).toEqual([
      expect.objectContaining({
        id: "setup-one",
        timeoutSeconds: 7,
        maxOutputBytes: 11
      }),
      expect.objectContaining({
        id: "setup-two",
        timeoutSeconds: 7,
        maxOutputBytes: 11
      })
    ]);
    expect(result.steps.find((step) => step.id === "setup-three")).toMatchObject({
      status: "skipped",
      summary: "Skipped because setup step budget was reached."
    });
  });

  it("caps concurrently tracked application processes", async () => {
    const plan = budgetPlan([
      applicationStep("application-api"),
      applicationStep("application-worker")
    ]);
    const result = await startApplicationProcesses({
      plan,
      sessionId: "budget-session",
      repositoryRoot: "/repo",
      maxProcesses: 1,
      earlyExitMs: 1
    });

    expect(result.steps.find((step) => step.id === "application-worker")).toMatchObject({
      status: "skipped",
      summary: "Skipped because tracked process budget was reached."
    });
  });

  it("records timed-out setup and startup budget data in session state", async () => {
    const repositoryRoot = await tempRoot("runtime-timeout");
    const result = await startRuntime({
      repositoryRoot,
      sessionId: "budget-runtime",
      budget: {
        commandTimeoutSeconds: 1,
        outputExcerptBytes: 32
      },
      contract: parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "budget-runtime",
          type: "service",
          primary_language: "typescript"
        },
        setup: {
          install: {
            command: process.execPath,
            args: ["-e", "setTimeout(() => {}, 5000)"]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      session: {
        budget: expect.objectContaining({
          commandTimeoutSeconds: 1,
          outputExcerptBytes: 32
        }),
        commandResults: [
          expect.objectContaining({
            id: "setup-install",
            status: "timed_out",
            timedOut: true
          })
        ]
      }
    });
  });
});

function budgetPlan(steps: readonly RuntimeStep[]): BootstrapPlan {
  return {
    repositoryRoot: "/repo",
    dryRun: false,
    steps,
    resources: [],
    prerequisites: [],
    warnings: []
  };
}

function setupStep(id: string): RuntimeStep {
  return {
    id,
    kind: "setup",
    title: id,
    status: "pending",
    summary: "Pending setup.",
    dependsOn: [],
    command: {
      command: process.execPath,
      args: ["-e", "console.log('ok')"],
      cwd: "/tmp",
      shell: false,
      environment: [],
      optional: false
    }
  };
}

function applicationStep(id: string): RuntimeStep {
  return {
    ...setupStep(id),
    kind: "application"
  };
}

async function tempRoot(name: string): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), `board-runtime-budget-${name}-`)));
}
