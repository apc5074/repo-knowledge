import { parseRepositoryContractObject } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import {
  attachPrerequisitesToPlan,
  buildBootstrapPlan,
  inspectRuntimePrerequisites,
  type VersionCommandRunner
} from "../src/index.js";

describe("runtime prerequisite inspection", () => {
  it("adds prerequisite checks to contract-backed dry-run plans", () => {
    const result = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contract: parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "prereq-fixture",
          type: "service",
          primary_language: "typescript"
        },
        setup: {
          install: {
            command: "pnpm",
            args: ["install"]
          }
        },
        services: {
          postgres: {
            id: "postgres",
            type: "postgresql",
            compose_service: "postgres"
          }
        }
      })
    });

    expect(result.plan.prerequisites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "docker", command: "docker", status: "unknown" }),
        expect.objectContaining({ id: "docker-compose", command: "docker", status: "unknown" }),
        expect.objectContaining({ id: "node", command: "node", status: "unknown" }),
        expect.objectContaining({
          id: "package-manager-pnpm",
          command: "pnpm",
          status: "unknown"
        })
      ])
    );
  });

  it("reports missing Docker before compose startup would run", async () => {
    const plan = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contract: parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "compose-fixture",
          type: "service",
          primary_language: "typescript"
        },
        services: {
          postgres: {
            id: "postgres",
            type: "postgresql",
            compose_service: "postgres"
          }
        }
      })
    }).plan;
    const runVersionCommand: VersionCommandRunner = async (command) => ({
      exitCode: command === "docker" ? 1 : 0,
      stdout: "",
      stderr: command === "docker" ? "docker not found" : "ok",
      timedOut: false
    });

    const prerequisites = await inspectRuntimePrerequisites({
      plan,
      runVersionCommand
    });

    expect(prerequisites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "docker",
          status: "missing",
          summary: expect.stringContaining("missing")
        }),
        expect.objectContaining({
          id: "docker-compose",
          status: "missing"
        })
      ])
    );
    expect(attachPrerequisitesToPlan(plan, prerequisites).warnings).toEqual(
      expect.arrayContaining([
        "docker prerequisite (docker) is required but was not found.",
        "docker-compose prerequisite (docker) is required but was not found."
      ])
    );
  });

  it("treats timed-out version checks as warnings instead of hard missing results", async () => {
    const plan = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contract: parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "timeout-fixture",
          type: "service",
          primary_language: "python"
        },
        setup: {
          install: {
            command: "uv",
            args: ["sync"]
          }
        }
      })
    }).plan;

    const prerequisites = await inspectRuntimePrerequisites({
      plan,
      runVersionCommand: async () => ({
        exitCode: null,
        stdout: "",
        stderr: "",
        timedOut: true
      })
    });

    expect(prerequisites.map((prerequisite) => prerequisite.status)).toContain("unknown");
    expect(attachPrerequisitesToPlan(plan, prerequisites).warnings).toEqual(
      expect.arrayContaining([
        "package-manager-uv prerequisite (uv) availability could not be confirmed."
      ])
    );
  });
});
