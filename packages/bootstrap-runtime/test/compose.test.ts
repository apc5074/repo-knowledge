import { parseRepositoryContractObject } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import {
  buildComposePsCommand,
  buildComposeStopCommand,
  buildComposeUpCommand,
  createComposeProjectName,
  detectComposeFilePaths,
  getComposeServiceTargets,
  inspectComposeStatus,
  parseComposePsJson,
  startComposeServices,
  stopComposeProject,
  type RuntimeCommandExecutor,
  type RuntimeCommandResult
} from "../src/index.js";

describe("Docker Compose runtime adapter", () => {
  it("detects compose targets and compose files from contract evidence", () => {
    const contract = fixtureContract();

    expect(getComposeServiceTargets(contract)).toEqual([
      {
        serviceId: "postgres",
        composeService: "db"
      },
      {
        serviceId: "redis",
        composeService: "cache"
      }
    ]);
    expect(detectComposeFilePaths({ repositoryRoot: "/repo", contract })).toEqual([
      "/repo/compose.yml"
    ]);
  });

  it("constructs deterministic compose up, ps, and stop commands without volume cleanup", () => {
    const projectName = createComposeProjectName({
      repositoryRoot: "/repo",
      sessionId: "session-1"
    });

    expect(projectName).toMatch(/^board-[a-f0-9]{12}$/);
    expect(
      buildComposeUpCommand({
        repositoryRoot: "/repo",
        projectName,
        composeFiles: ["/repo/compose.yml"],
        services: ["db", "cache"]
      })
    ).toMatchObject({
      command: "docker",
      args: ["compose", "-f", "/repo/compose.yml", "-p", projectName, "up", "-d", "db", "cache"],
      cwd: "/repo",
      shell: false
    });
    expect(
      buildComposePsCommand({
        repositoryRoot: "/repo",
        projectName,
        composeFiles: ["/repo/compose.yml"]
      }).args
    ).toEqual(["compose", "-f", "/repo/compose.yml", "-p", projectName, "ps", "--format", "json"]);
    expect(
      buildComposeStopCommand({
        repositoryRoot: "/repo",
        projectName,
        composeFiles: ["/repo/compose.yml"]
      }).args
    ).toEqual(["compose", "-f", "/repo/compose.yml", "-p", projectName, "stop"]);
    expect(
      buildComposeStopCommand({
        repositoryRoot: "/repo",
        projectName,
        composeFiles: ["/repo/compose.yml"],
        down: true
      }).args
    ).toEqual(["compose", "-f", "/repo/compose.yml", "-p", projectName, "down"]);
  });

  it("starts and stops only contract-referenced compose services through mocked Docker commands", async () => {
    const calls: string[] = [];
    const commandResult = (id: string): RuntimeCommandResult => ({
      id,
      command: "docker",
      args: [],
      cwd: "/repo",
      status: "succeeded",
      exitCode: 0
    });
    const runCommand: RuntimeCommandExecutor = async ({ id, command }) => {
      calls.push(`${id}:${command.args.join(" ")}`);
      return commandResult(id);
    };
    const startResult = await startComposeServices({
      repositoryRoot: "/repo",
      projectName: "board-project",
      composeFiles: ["/repo/compose.yml"],
      services: ["db", "cache"],
      runCommand
    });
    const stopResult = await stopComposeProject({
      repositoryRoot: "/repo",
      projectName: "board-project",
      composeFiles: ["/repo/compose.yml"],
      runCommand
    });

    expect(startResult.status).toBe("succeeded");
    expect(stopResult.status).toBe("succeeded");
    expect(calls).toEqual([
      "compose-up:compose -f /repo/compose.yml -p board-project up -d db cache",
      "compose-stop:compose -f /repo/compose.yml -p board-project stop"
    ]);
  });

  it("parses compose ps JSON status lines", async () => {
    expect(
      parseComposePsJson(
        [
          JSON.stringify({ Service: "db", State: "running" }),
          JSON.stringify({ Service: "worker", State: "exited" })
        ].join("\n")
      )
    ).toEqual([
      {
        service: "db",
        status: "running",
        rawStatus: "running"
      },
      {
        service: "worker",
        status: "failed",
        rawStatus: "exited"
      }
    ]);

    const result = await inspectComposeStatus({
      repositoryRoot: "/repo",
      projectName: "board-project",
      runCommand: async ({ id }) => ({
        id,
        command: "docker",
        args: [],
        cwd: "/repo",
        status: "succeeded",
        exitCode: 0,
        stdoutExcerpt: JSON.stringify({ Service: "db", State: "running" })
      })
    });

    expect(result.statuses).toEqual([
      {
        service: "db",
        status: "running",
        rawStatus: "running"
      }
    ]);
  });
});

function fixtureContract() {
  return parseRepositoryContractObject({
    version: 1,
    repository: {
      name: "compose-fixture",
      type: "service",
      primary_language: "typescript"
    },
    services: {
      redis: {
        id: "redis",
        type: "redis",
        compose_service: "cache",
        evidence: [
          {
            kind: "config",
            source_path: "compose.yml"
          }
        ]
      },
      postgres: {
        id: "postgres",
        type: "postgresql",
        compose_service: "db",
        evidence: [
          {
            kind: "config",
            source_path: "compose.yml"
          }
        ]
      },
      external: {
        id: "external",
        type: "unknown"
      }
    }
  });
}
