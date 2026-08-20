import { parseRepositoryContractObject } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import { buildBootstrapPlan, runSetupSteps, type RuntimeCommandResult } from "../src/index.js";

describe("setup step runner", () => {
  it("runs named and ordered setup commands in deterministic plan order", async () => {
    const plan = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contract: fixtureContract()
    }).plan;
    const calls: string[] = [];
    const result = await runSetupSteps({
      plan,
      runCommand: async ({ id, command }) => {
        calls.push(`${id}:${command.command} ${command.args.join(" ")}`.trim());
        return commandResult(id, "succeeded");
      }
    });

    expect(calls).toEqual([
      "setup-install:pnpm install",
      "setup-migrate:pnpm migrate",
      "setup-seed:pnpm seed",
      "setup-step-generate-client:pnpm generate",
      "setup-step-warm-cache:pnpm cache:warm"
    ]);
    expect(result.status).toBe("succeeded");
    expect(result.steps.filter((step) => step.kind === "setup").map((step) => step.status)).toEqual(
      ["succeeded", "succeeded", "succeeded", "succeeded", "succeeded"]
    );
  });

  it("skips dependent setup steps after required dependency failure", async () => {
    const plan = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contract: fixtureContract()
    }).plan;
    const result = await runSetupSteps({
      plan,
      runCommand: async ({ id }) =>
        id === "setup-step-generate-client"
          ? commandResult(id, "failed", 2)
          : commandResult(id, "succeeded")
    });

    expect(result.status).toBe("failed");
    expect(result.errors).toEqual(["setup-step-generate-client failed."]);
    expect(result.warnings).toEqual([
      "setup-step-warm-cache skipped because required dependency setup-step-generate-client failed."
    ]);
    expect(result.steps.find((step) => step.id === "setup-step-warm-cache")).toMatchObject({
      status: "skipped",
      summary: "Skipped because setup-step-generate-client failed."
    });
  });

  it("reports optional setup failure without failing the whole setup run", async () => {
    const plan = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contract: fixtureContract()
    }).plan;
    const result = await runSetupSteps({
      plan,
      runCommand: async ({ id }) =>
        id === "setup-step-warm-cache"
          ? commandResult(id, "failed", 3)
          : commandResult(id, "succeeded")
    });

    expect(result.status).toBe("succeeded");
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(["setup-step-warm-cache failed."]);
    expect(result.steps.find((step) => step.id === "setup-step-warm-cache")).toMatchObject({
      status: "failed"
    });
  });

  it("skips setup steps blocked by missing required environment", async () => {
    const plan = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contract: fixtureContract()
    }).plan;
    const result = await runSetupSteps({
      plan,
      environment: {
        variables: [],
        values: {},
        missingRequiredNames: ["DATABASE_URL"],
        missingOptionalNames: [],
        blockedStepIds: ["setup-migrate"],
        warnings: [],
        errors: ["DATABASE_URL is required for local runtime and is not set."]
      },
      runCommand: async ({ id }) => commandResult(id, "succeeded")
    });

    expect(result.status).toBe("failed");
    expect(result.errors).toEqual([
      "setup-migrate skipped because required environment is missing."
    ]);
    expect(result.steps.find((step) => step.id === "setup-migrate")).toMatchObject({
      status: "skipped"
    });
  });
});

function fixtureContract() {
  return parseRepositoryContractObject({
    version: 1,
    repository: {
      name: "setup-runner-fixture",
      type: "service",
      primary_language: "typescript"
    },
    setup: {
      install: {
        command: "pnpm",
        args: ["install"]
      },
      migrate: {
        command: "pnpm",
        args: ["migrate"],
        environment: ["DATABASE_URL"]
      },
      seed: {
        command: "pnpm",
        args: ["seed"]
      },
      steps: [
        {
          id: "generate-client",
          kind: "generate_code",
          command: {
            command: "pnpm",
            args: ["generate"]
          }
        },
        {
          id: "warm-cache",
          kind: "custom",
          depends_on: ["generate-client"],
          optional: true,
          optional_reason: "Cache is optional.",
          command: {
            command: "pnpm",
            args: ["cache:warm"]
          }
        }
      ]
    }
  });
}

function commandResult(
  id: string,
  status: RuntimeCommandResult["status"],
  exitCode = 0
): RuntimeCommandResult {
  return {
    id,
    command: "pnpm",
    args: [],
    cwd: "/repo",
    status,
    exitCode,
    timedOut: status === "timed_out"
  };
}
