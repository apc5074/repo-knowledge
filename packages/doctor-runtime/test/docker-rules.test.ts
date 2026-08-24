import { describe, expect, it } from "vitest";

import { createDockerDiagnosticRules, runDiagnosticRules } from "../src/index.js";
import type { DiagnosticRuleContext, DockerInspection } from "../src/index.js";

describe("docker diagnostic rules", () => {
  it("diagnoses Docker unavailable states", () => {
    const result = runDiagnosticRules({
      rules: createDockerDiagnosticRules(),
      context: contextWithDocker({
        dockerCliAvailable: false,
        dockerDaemonAvailable: false,
        composeAvailable: false,
        relevantServices: [],
        relevantContainers: [],
        warnings: [],
        observations: [
          {
            kind: "docker_cli_missing",
            severity: "error",
            summary: "Docker CLI is missing."
          },
          {
            kind: "docker_daemon_unavailable",
            severity: "error",
            summary: "Docker daemon is unavailable."
          },
          {
            kind: "compose_unavailable",
            severity: "error",
            summary: "Docker Compose is unavailable."
          }
        ]
      })
    });

    expect(result.findings.map((finding) => finding.title)).toEqual([
      "Docker CLI is missing",
      "Docker daemon is unavailable",
      "Docker Compose is unavailable"
    ]);
    expect(result.findings.map((finding) => finding.severity)).toEqual([
      "blocking",
      "blocking",
      "error"
    ]);
  });

  it("diagnoses failed and unhealthy relevant containers", () => {
    const result = runDiagnosticRules({
      rules: createDockerDiagnosticRules(),
      context: contextWithDocker({
        dockerCliAvailable: true,
        dockerDaemonAvailable: true,
        composeAvailable: true,
        relevantServices: [{ serviceId: "postgres", composeService: "postgres" }],
        relevantContainers: [],
        warnings: [],
        observations: [
          {
            kind: "container_unhealthy",
            severity: "error",
            serviceId: "postgres",
            composeService: "postgres",
            containerName: "repo-postgres-1",
            rawState: "Up (unhealthy)",
            summary: "Container repo-postgres-1 for postgres is unhealthy."
          },
          {
            kind: "container_failed",
            severity: "error",
            serviceId: "redis",
            composeService: "redis",
            containerName: "repo-redis-1",
            rawState: "Exited (1)",
            summary: "Container repo-redis-1 for redis is not running."
          }
        ]
      })
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        id: "docker.container_unhealthy.postgres",
        title: "Compose service container is unhealthy",
        severity: "error",
        confidence: "confirmed"
      }),
      expect.objectContaining({
        id: "docker.container_failed.redis",
        title: "Compose service container failed"
      })
    ]);
    expect(JSON.stringify(result.findings)).toContain("repo-postgres-1");
  });
});

function contextWithDocker(docker: DockerInspection): DiagnosticRuleContext {
  return {
    repository: {
      repositoryRoot: "/repo",
      contractPath: "/repo/.board/repository.yaml",
      git: { available: false, warnings: [] },
      componentIds: [],
      applicationIds: [],
      serviceIds: [],
      environmentNames: [],
      setupStepIds: [],
      verificationCheckIds: [],
      verificationRuleIds: [],
      generatedPathPatterns: [],
      documentationPathPatterns: [],
      knownLimitationIds: [],
      warnings: [],
      findings: []
    },
    docker
  };
}
