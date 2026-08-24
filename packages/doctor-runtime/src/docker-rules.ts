import { createDiagnosticFinding, type DiagnosticRule } from "./diagnostic-rule.js";
import type { DockerObservation } from "./docker-inspector.js";
import type { DiagnosticEvidence, DiagnosticFinding } from "./types.js";

export function createDockerDiagnosticRules(): readonly DiagnosticRule[] {
  return [dockerObservationRule];
}

export const dockerObservationRule: DiagnosticRule = {
  id: "docker.observations",
  category: "docker",
  description: "Diagnose Docker and Compose observations for repository-relevant services.",
  prerequisites: ["docker"],
  run: (context) => ({
    findings:
      context.docker?.observations.map((observation) => findingForObservation(observation)) ?? [],
    warnings: []
  })
};

function findingForObservation(observation: DockerObservation): DiagnosticFinding {
  return createDiagnosticFinding({
    id: `docker.${observation.kind}.${sanitizeId(
      observation.serviceId ?? observation.composeService ?? observation.containerName ?? "local"
    )}`,
    ruleId: dockerObservationRule.id,
    category: "docker",
    severity: severityForObservation(observation),
    confidence: confidenceForObservation(observation),
    title: titleForObservation(observation),
    summary: observation.summary,
    evidence: [evidenceForObservation(observation)],
    suggestedNextSteps: [nextStepForObservation(observation)]
  });
}

function evidenceForObservation(observation: DockerObservation): DiagnosticEvidence {
  return {
    kind: "docker",
    summary: observation.summary,
    metadata: {
      kind: observation.kind,
      ...(observation.serviceId === undefined ? {} : { serviceId: observation.serviceId }),
      ...(observation.composeService === undefined
        ? {}
        : { composeService: observation.composeService }),
      ...(observation.containerName === undefined
        ? {}
        : { containerName: observation.containerName }),
      ...(observation.rawState === undefined ? {} : { rawState: observation.rawState })
    }
  };
}

function severityForObservation(observation: DockerObservation): DiagnosticFinding["severity"] {
  if (observation.kind === "compose_service_missing") {
    return "warning";
  }

  if (
    observation.kind === "docker_cli_missing" ||
    observation.kind === "docker_daemon_unavailable"
  ) {
    return "blocking";
  }

  return "error";
}

function confidenceForObservation(observation: DockerObservation): DiagnosticFinding["confidence"] {
  return observation.kind === "compose_service_missing" ? "high" : "confirmed";
}

function titleForObservation(observation: DockerObservation): string {
  if (observation.kind === "docker_cli_missing") {
    return "Docker CLI is missing";
  }

  if (observation.kind === "docker_daemon_unavailable") {
    return "Docker daemon is unavailable";
  }

  if (observation.kind === "compose_unavailable") {
    return "Docker Compose is unavailable";
  }

  if (observation.kind === "compose_service_missing") {
    return "Compose service container is missing";
  }

  if (observation.kind === "container_unhealthy") {
    return "Compose service container is unhealthy";
  }

  return "Compose service container failed";
}

function nextStepForObservation(observation: DockerObservation): string {
  if (observation.kind === "docker_cli_missing") {
    return "Install Docker CLI or make it available on PATH, then rerun board doctor.";
  }

  if (observation.kind === "docker_daemon_unavailable") {
    return "Start Docker Desktop or the Docker daemon, then rerun board doctor.";
  }

  if (observation.kind === "compose_unavailable") {
    return "Install or enable Docker Compose, then rerun board doctor.";
  }

  if (observation.composeService !== undefined) {
    return `Inspect Compose service ${observation.composeService} before rerunning local startup.`;
  }

  return "Inspect Docker state before rerunning local startup.";
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}
