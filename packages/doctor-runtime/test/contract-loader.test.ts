import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { loadDoctorRepositoryContext, type GitCommandRunner } from "../src/index.js";

describe("doctor repository context loader", () => {
  it("loads a valid repository contract with diagnostic context IDs", async () => {
    const repositoryRoot = await fixtureRepository(validContractYaml);
    const context = await loadDoctorRepositoryContext({
      repositoryRoot,
      runGitCommand: successfulGit(repositoryRoot)
    });

    expect(context.findings).toEqual([]);
    expect(context.contract?.repository.name).toBe("fixture-full");
    expect(context.contractVersion).toBe(1);
    expect(context.applicationIds).toEqual(["api"]);
    expect(context.serviceIds).toEqual(["postgres"]);
    expect(context.componentIds).toEqual(["api", "postgres"]);
    expect(context.environmentNames).toEqual(["DATABASE_URL"]);
    expect(context.setupStepIds).toEqual(["install"]);
    expect(context.verificationCheckIds).toEqual(["typecheck"]);
    expect(context.generatedPathPatterns).toEqual(["apps/api/src/generated/**"]);
    expect(context.knownLimitationIds).toEqual(["fixture-local-only"]);
    expect(context.git).toMatchObject({
      available: true,
      repositoryRoot,
      commitSha: "abc123",
      branch: "main"
    });
  });

  it("returns a structured finding when the contract is missing", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "doctor-context-missing-"));
    const context = await loadDoctorRepositoryContext({
      repositoryRoot,
      runGitCommand: unavailableGit
    });

    expect(context.contract).toBeUndefined();
    expect(context.findings).toHaveLength(1);
    expect(context.findings[0]).toMatchObject({
      id: "contract.missing",
      category: "contract",
      kind: "direct_local_fact",
      severity: "blocking",
      confidence: "confirmed"
    });
    expect(context.warnings).toContain("Git metadata is unavailable for this repository context.");
  });

  it("returns a structured finding when the contract is invalid", async () => {
    const repositoryRoot = await fixtureRepository("version: 1\nrepository:\n  name: bad\n");
    const context = await loadDoctorRepositoryContext({
      repositoryRoot,
      runGitCommand: successfulGit(repositoryRoot)
    });

    expect(context.contract).toBeUndefined();
    expect(context.findings).toHaveLength(1);
    expect(context.findings[0]).toMatchObject({
      id: "contract.invalid",
      severity: "blocking",
      confidence: "confirmed"
    });
    expect(context.findings[0]?.evidence[0]?.metadata?.issueCount).toBeGreaterThan(0);
  });
});

async function fixtureRepository(contractYaml: string): Promise<string> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "doctor-context-"));
  await mkdir(join(repositoryRoot, ".board"), { recursive: true });
  await writeFile(join(repositoryRoot, ".board/repository.yaml"), contractYaml, "utf8");
  return repositoryRoot;
}

function successfulGit(repositoryRoot: string): GitCommandRunner {
  return async (args) => {
    if (args.join(" ") === "rev-parse --show-toplevel") {
      return {
        exitCode: 0,
        stdout: repositoryRoot,
        stderr: ""
      };
    }

    if (args.join(" ") === "rev-parse HEAD") {
      return {
        exitCode: 0,
        stdout: "abc123",
        stderr: ""
      };
    }

    return {
      exitCode: 0,
      stdout: "main",
      stderr: ""
    };
  };
}

const unavailableGit: GitCommandRunner = async () => ({
  exitCode: 1,
  stdout: "",
  stderr: "not a git repository"
});

const validContractYaml = `version: 1
repository:
  name: fixture-full
  type: service
  primary_language: typescript
applications:
  api:
    id: api
    type: api
    working_directory: apps/api
    depends_on:
      - postgres
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
verification:
  default:
    - id: typecheck
      kind: typecheck
      command:
        command: pnpm
        args:
          - typecheck
generated_files:
  - pattern: apps/api/src/generated/**
    generated_by:
      command: pnpm
      args:
        - generate
known_limitations:
  - id: fixture-local-only
    summary: External API calls are mocked locally.
    impact: Integration behavior must be checked outside local development.
    status: accepted
`;
