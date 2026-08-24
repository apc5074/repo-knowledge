import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  inspectDocker,
  loadDoctorRepositoryContext,
  parseDockerPsJson,
  type DockerCommandRunner
} from "../src/index.js";

describe("docker inspector", () => {
  it("diagnoses missing Docker CLI", async () => {
    const context = await loadContext();
    const inspection = await inspectDocker({
      context,
      runDockerCommand: async () => ({
        exitCode: null,
        stdout: "",
        stderr: "",
        timedOut: false
      })
    });

    expect(inspection.dockerCliAvailable).toBe(false);
    expect(inspection.observations).toEqual([
      expect.objectContaining({
        kind: "docker_cli_missing",
        severity: "error"
      })
    ]);
  });

  it("diagnoses unavailable daemon and compose separately", async () => {
    const context = await loadContext();
    const inspection = await inspectDocker({
      context,
      runDockerCommand: fakeDocker({
        "--version": ok("Docker version 28.0.0"),
        info: failed("Cannot connect to the Docker daemon"),
        "compose version": failed("compose unavailable")
      })
    });

    expect(inspection.dockerCliAvailable).toBe(true);
    expect(inspection.dockerDaemonAvailable).toBe(false);
    expect(inspection.composeAvailable).toBe(false);
    expect(inspection.observations.map((observation) => observation.kind)).toEqual([
      "docker_daemon_unavailable",
      "compose_unavailable"
    ]);
  });

  it("detects failed and unhealthy relevant containers while ignoring unrelated containers", async () => {
    const context = await loadContext();
    const inspection = await inspectDocker({
      context,
      runDockerCommand: fakeDocker({
        "--version": ok("Docker version 28.0.0"),
        info: ok("daemon ok"),
        "compose version": ok("Docker Compose version v2.30.0"),
        "ps --all --format json": ok(
          [
            dockerPsLine("repo-postgres-1", "running", "Up 3 minutes (unhealthy)", "postgres"),
            dockerPsLine("repo-redis-1", "exited", "Exited (1) 10 seconds ago", "redis"),
            dockerPsLine("unrelated-nginx-1", "exited", "Exited (1)", "nginx")
          ].join("\n")
        )
      })
    });

    expect(inspection.relevantContainers.map((container) => container.name)).toEqual([
      "repo-postgres-1",
      "repo-redis-1"
    ]);
    expect(inspection.observations).toEqual([
      expect.objectContaining({
        kind: "container_unhealthy",
        serviceId: "postgres",
        composeService: "postgres",
        containerName: "repo-postgres-1"
      }),
      expect.objectContaining({
        kind: "container_failed",
        serviceId: "redis",
        composeService: "redis",
        containerName: "repo-redis-1"
      })
    ]);
  });

  it("parses Docker ps JSON lines", () => {
    expect(parseDockerPsJson(dockerPsLine("repo-postgres-1", "running", "Up", "postgres"))).toEqual(
      [
        {
          id: "abc",
          name: "repo-postgres-1",
          image: "postgres:16",
          state: "running",
          status: "Up",
          composeService: "postgres",
          labels: {
            "com.docker.compose.service": "postgres"
          }
        }
      ]
    );
  });
});

async function loadContext() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "doctor-docker-"));
  await mkdir(join(repositoryRoot, ".board"), { recursive: true });
  await writeFile(join(repositoryRoot, ".board/repository.yaml"), contractYaml, "utf8");

  return loadDoctorRepositoryContext({
    repositoryRoot,
    runGitCommand: async () => ({
      exitCode: 0,
      stdout: repositoryRoot,
      stderr: ""
    })
  });
}

function fakeDocker(
  results: Readonly<Record<string, Awaited<ReturnType<DockerCommandRunner>>>>
): DockerCommandRunner {
  return async (args) =>
    results[args.join(" ")] ?? {
      exitCode: 1,
      stdout: "",
      stderr: "",
      timedOut: false
    };
}

function ok(stdout: string) {
  return {
    exitCode: 0,
    stdout,
    stderr: "",
    timedOut: false
  };
}

function failed(stderr: string) {
  return {
    exitCode: 1,
    stdout: "",
    stderr,
    timedOut: false
  };
}

function dockerPsLine(name: string, state: string, status: string, composeService: string): string {
  return JSON.stringify({
    ID: "abc",
    Names: name,
    Image: "postgres:16",
    State: state,
    Status: status,
    Labels: `com.docker.compose.service=${composeService}`
  });
}

const contractYaml = `version: 1
repository:
  name: docker-fixture
  type: service
  primary_language: typescript
services:
  postgres:
    id: postgres
    type: postgresql
    compose_service: postgres
  redis:
    id: redis
    type: redis
    compose_service: redis
`;
