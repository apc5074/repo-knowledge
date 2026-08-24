import { spawn } from "node:child_process";

import type { DoctorRepositoryContext } from "./contract-loader.js";

export type DockerCommandResult = {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
};

export type DockerCommandRunner = (
  args: readonly string[],
  timeoutMs: number
) => Promise<DockerCommandResult>;

export type DockerObservationKind =
  | "docker_cli_missing"
  | "docker_daemon_unavailable"
  | "compose_unavailable"
  | "compose_service_missing"
  | "container_failed"
  | "container_unhealthy";

export type DockerObservation = {
  readonly kind: DockerObservationKind;
  readonly severity: "warning" | "error";
  readonly summary: string;
  readonly serviceId?: string;
  readonly composeService?: string;
  readonly containerName?: string;
  readonly rawState?: string;
};

export type DockerContainerObservation = {
  readonly id?: string;
  readonly name: string;
  readonly image?: string;
  readonly state?: string;
  readonly status?: string;
  readonly composeService?: string;
  readonly labels: Readonly<Record<string, string>>;
};

export type DockerInspection = {
  readonly dockerCliAvailable: boolean;
  readonly dockerDaemonAvailable: boolean;
  readonly composeAvailable: boolean;
  readonly relevantServices: readonly {
    readonly serviceId: string;
    readonly composeService: string;
  }[];
  readonly relevantContainers: readonly DockerContainerObservation[];
  readonly observations: readonly DockerObservation[];
  readonly warnings: readonly string[];
};

export type InspectDockerInput = {
  readonly context: DoctorRepositoryContext;
  readonly runDockerCommand?: DockerCommandRunner;
  readonly timeoutMs?: number;
};

const defaultTimeoutMs = 2_500;

export async function inspectDocker(input: InspectDockerInput): Promise<DockerInspection> {
  const services = composeServices(input.context);
  const runDockerCommand = input.runDockerCommand ?? runDefaultDockerCommand;
  const timeoutMs = input.timeoutMs ?? defaultTimeoutMs;
  const dockerVersion = await runDockerCommand(["--version"], timeoutMs).catch(missingCommand);
  const dockerCliAvailable = dockerVersion.exitCode === 0 && !dockerVersion.timedOut;

  if (!dockerCliAvailable) {
    return baseInspection({
      services,
      observations: [
        {
          kind: "docker_cli_missing",
          severity: "error",
          summary: "Docker CLI is missing or did not return a version."
        }
      ],
      warnings: ["Docker CLI availability could not be confirmed."]
    });
  }

  const dockerInfo = await runDockerCommand(["info"], timeoutMs).catch(missingCommand);
  const dockerDaemonAvailable = dockerInfo.exitCode === 0 && !dockerInfo.timedOut;
  const composeVersion = await runDockerCommand(["compose", "version"], timeoutMs).catch(
    missingCommand
  );
  const composeAvailable = composeVersion.exitCode === 0 && !composeVersion.timedOut;
  const observations: DockerObservation[] = [];
  const warnings: string[] = [];

  if (!dockerDaemonAvailable) {
    observations.push({
      kind: "docker_daemon_unavailable",
      severity: "error",
      summary: "Docker daemon is unavailable."
    });
    warnings.push("Docker daemon availability could not be confirmed.");
  }

  if (!composeAvailable) {
    observations.push({
      kind: "compose_unavailable",
      severity: "error",
      summary: "Docker Compose is unavailable."
    });
    warnings.push("Docker Compose availability could not be confirmed.");
  }

  if (!dockerDaemonAvailable) {
    return {
      dockerCliAvailable,
      dockerDaemonAvailable,
      composeAvailable,
      relevantServices: services,
      relevantContainers: [],
      observations,
      warnings
    };
  }

  const ps = await runDockerCommand(["ps", "--all", "--format", "json"], timeoutMs).catch(
    missingCommand
  );
  const containers = parseDockerPsJson(ps.stdout);
  const relevantContainers = containers.filter((container) =>
    isRelevantContainer(container, services)
  );

  for (const service of services) {
    const serviceContainers = relevantContainers.filter(
      (container) =>
        container.composeService === service.composeService ||
        container.name.includes(service.composeService)
    );

    if (serviceContainers.length === 0) {
      observations.push({
        kind: "compose_service_missing",
        severity: "warning",
        serviceId: service.serviceId,
        composeService: service.composeService,
        summary: `Compose service ${service.composeService} has no matching local container.`
      });
      continue;
    }

    for (const container of serviceContainers) {
      if (isUnhealthy(container)) {
        observations.push({
          kind: "container_unhealthy",
          severity: "error",
          serviceId: service.serviceId,
          composeService: service.composeService,
          containerName: container.name,
          rawState: container.status ?? container.state,
          summary: `Container ${container.name} for ${service.composeService} is unhealthy.`
        });
      } else if (isFailed(container)) {
        observations.push({
          kind: "container_failed",
          severity: "error",
          serviceId: service.serviceId,
          composeService: service.composeService,
          containerName: container.name,
          rawState: container.status ?? container.state,
          summary: `Container ${container.name} for ${service.composeService} is not running.`
        });
      }
    }
  }

  return {
    dockerCliAvailable,
    dockerDaemonAvailable,
    composeAvailable,
    relevantServices: services,
    relevantContainers,
    observations,
    warnings
  };
}

export function parseDockerPsJson(output: string): readonly DockerContainerObservation[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => parseDockerPsLine(line));
}

function parseDockerPsLine(line: string): readonly DockerContainerObservation[] {
  try {
    const parsed = JSON.parse(line) as unknown;
    const entries = Array.isArray(parsed) ? parsed : [parsed];

    return entries.flatMap((entry) => {
      if (!isDockerPsObject(entry)) {
        return [];
      }

      const labels = parseLabels(entry.Labels);

      return [
        {
          id: entry.ID,
          name: entry.Names,
          image: entry.Image,
          state: entry.State,
          status: entry.Status,
          composeService: labels["com.docker.compose.service"],
          labels
        }
      ];
    });
  } catch {
    return [];
  }
}

function composeServices(context: DoctorRepositoryContext): DockerInspection["relevantServices"] {
  return Object.values(context.contract?.services ?? {})
    .filter((service) => service.compose_service !== undefined)
    .map((service) => ({
      serviceId: service.id,
      composeService: service.compose_service as string
    }))
    .sort((left, right) => left.serviceId.localeCompare(right.serviceId));
}

function isRelevantContainer(
  container: DockerContainerObservation,
  services: DockerInspection["relevantServices"]
): boolean {
  return services.some(
    (service) =>
      container.composeService === service.composeService ||
      container.name.includes(service.composeService)
  );
}

function isUnhealthy(container: DockerContainerObservation): boolean {
  return `${container.state ?? ""} ${container.status ?? ""}`.toLowerCase().includes("unhealthy");
}

function isFailed(container: DockerContainerObservation): boolean {
  const text = `${container.state ?? ""} ${container.status ?? ""}`.toLowerCase();

  return text.includes("exited") || text.includes("dead") || text.includes("restarting");
}

function parseLabels(labels: string | undefined): Readonly<Record<string, string>> {
  if (labels === undefined || labels.trim() === "") {
    return {};
  }

  return Object.fromEntries(
    labels
      .split(",")
      .map((label) => label.split("="))
      .filter((parts): parts is [string, string] => parts.length === 2 && parts[0] !== undefined)
      .map(([key, value]) => [key, value])
  );
}

function baseInspection(input: {
  readonly services: DockerInspection["relevantServices"];
  readonly observations: readonly DockerObservation[];
  readonly warnings: readonly string[];
}): DockerInspection {
  return {
    dockerCliAvailable: false,
    dockerDaemonAvailable: false,
    composeAvailable: false,
    relevantServices: input.services,
    relevantContainers: [],
    observations: input.observations,
    warnings: input.warnings
  };
}

function missingCommand(): DockerCommandResult {
  return {
    exitCode: null,
    stdout: "",
    stderr: "",
    timedOut: false
  };
}

async function runDefaultDockerCommand(
  args: readonly string[],
  timeoutMs: number
): Promise<DockerCommandResult> {
  return new Promise((resolveResult) => {
    const child = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`;
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`;
    });
    child.on("error", () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolveResult({
        exitCode: null,
        stdout,
        stderr,
        timedOut
      });
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolveResult({
        exitCode,
        stdout,
        stderr,
        timedOut
      });
    });
  });
}

function isDockerPsObject(value: unknown): value is {
  readonly ID?: string;
  readonly Names: string;
  readonly Image?: string;
  readonly State?: string;
  readonly Status?: string;
  readonly Labels?: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "Names" in value &&
    typeof value.Names === "string"
  );
}
