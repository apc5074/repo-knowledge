import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  collectLocalToolRequirements,
  inspectLocalEnvironment,
  loadDoctorRepositoryContext,
  type VersionCommandRunner
} from "../src/index.js";

describe("local environment inspector", () => {
  it("collects relevant tool requirements from the contract", async () => {
    const context = await loadContext();
    const requirements = collectLocalToolRequirements(context.contract!);

    expect(requirements.map((requirement) => requirement.id)).toEqual([
      "docker",
      "docker-compose",
      "node",
      "package-manager-pnpm"
    ]);
  });

  it("reports missing tools, unsupported versions, missing env names, and expected files", async () => {
    const context = await loadContext();
    const observed = await inspectLocalEnvironment({
      context,
      env: {},
      versionRequirements: {
        node: ">=22.0.0"
      },
      runVersionCommand: fakeVersions({
        node: {
          exitCode: 0,
          stdout: "v20.1.0",
          stderr: "",
          timedOut: false
        },
        pnpm: {
          exitCode: 1,
          stdout: "",
          stderr: "command not found: pnpm",
          timedOut: false
        },
        docker: {
          exitCode: 0,
          stdout: "Docker version 28.0.0",
          stderr: "",
          timedOut: false
        },
        "docker compose": {
          exitCode: 0,
          stdout: "Docker Compose version v2.30.0",
          stderr: "",
          timedOut: false
        }
      }),
      fileExists: async (path) => path.endsWith("package.json")
    });

    expect(observed.tools.find((tool) => tool.id === "node")).toMatchObject({
      status: "unsupported",
      parsedVersion: "20.1.0",
      versionRequirement: ">=22.0.0"
    });
    expect(observed.tools.find((tool) => tool.id === "package-manager-pnpm")).toMatchObject({
      status: "missing",
      versionOutput: "command not found: pnpm"
    });
    expect(observed.environment).toEqual([
      {
        name: "DATABASE_URL",
        status: "missing",
        required: true,
        secret: true,
        usedBy: ["application:api", "contract.environment", "service:postgres"],
        summary: "DATABASE_URL is missing and required."
      }
    ]);
    expect(observed.expectedFiles).toEqual([
      {
        path: "package.json",
        status: "present",
        reason: "Node.js runtime metadata"
      },
      {
        path: "pnpm-lock.yaml",
        status: "missing",
        reason: "package manager lockfile"
      }
    ]);
    expect(observed.warnings).toContain("pnpm is required but missing.");
    expect(observed.warnings).toContain("node does not satisfy >=22.0.0.");
  });

  it("skips inspection when the contract is unavailable", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "doctor-env-missing-"));
    const context = await loadDoctorRepositoryContext({
      repositoryRoot,
      runGitCommand: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: ""
      })
    });

    await expect(inspectLocalEnvironment({ context })).resolves.toEqual({
      tools: [],
      environment: [],
      expectedFiles: [],
      warnings: [
        "Local environment inspection skipped because the repository contract is unavailable."
      ]
    });
  });
});

async function loadContext() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "doctor-env-"));
  await mkdir(join(repositoryRoot, ".board"), { recursive: true });
  await writeFile(join(repositoryRoot, "package.json"), "{}\n", "utf8");
  await writeFile(join(repositoryRoot, ".board/repository.yaml"), contractYaml, "utf8");

  return loadDoctorRepositoryContext({
    repositoryRoot,
    runGitCommand: async (args) => ({
      exitCode: 0,
      stdout: args.join(" ") === "rev-parse --show-toplevel" ? repositoryRoot : "abc123",
      stderr: ""
    })
  });
}

function fakeVersions(
  results: Readonly<Record<string, Awaited<ReturnType<VersionCommandRunner>>>>
): VersionCommandRunner {
  return async (command, args) => {
    const key = command === "docker" && args[0] === "compose" ? "docker compose" : command;

    return (
      results[key] ?? {
        exitCode: 1,
        stdout: "",
        stderr: "",
        timedOut: false
      }
    );
  };
}

const contractYaml = `version: 1
repository:
  name: fixture-env
  type: service
  primary_language: typescript
applications:
  api:
    id: api
    type: api
    environment:
      - DATABASE_URL
services:
  postgres:
    id: postgres
    type: postgresql
    compose_service: postgres
    environment:
      - DATABASE_URL
environment:
  DATABASE_URL:
    name: DATABASE_URL
    required: true
    secret: true
setup:
  install:
    command: pnpm
    args:
      - install
`;
