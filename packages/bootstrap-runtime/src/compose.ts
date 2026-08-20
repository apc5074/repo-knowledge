import { createHash } from "node:crypto";
import { join } from "node:path";

import type { RepositoryContract } from "@repo-knowledge/repository-contract";

import type { RuntimeCommandExecutor } from "./setup-runner.js";
import { runRuntimeCommand } from "./command-runner.js";
import type { RuntimeCommandResult, RuntimePlannedCommand, RuntimeStatus } from "./types.js";

export type ComposeServiceTarget = {
  readonly serviceId: string;
  readonly composeService: string;
};

export type ComposeCommandInput = {
  readonly repositoryRoot: string;
  readonly projectName: string;
  readonly composeFiles?: readonly string[];
  readonly services: readonly string[];
};

export type ComposeRunInput = ComposeCommandInput & {
  readonly runCommand?: RuntimeCommandExecutor;
  readonly env?: Readonly<Record<string, string | undefined>>;
};

export type ComposeStatus = {
  readonly service: string;
  readonly status: RuntimeStatus;
  readonly rawStatus: string;
};

export function createComposeProjectName(input: {
  readonly repositoryRoot: string;
  readonly sessionId: string;
}): string {
  const hash = createHash("sha256")
    .update(`${input.repositoryRoot}:${input.sessionId}`)
    .digest("hex")
    .slice(0, 12);

  return `board-${hash}`;
}

export function getComposeServiceTargets(
  contract: RepositoryContract
): readonly ComposeServiceTarget[] {
  return Object.values(contract.services ?? {})
    .filter((service) => service.compose_service !== undefined)
    .map((service) => ({
      serviceId: service.id,
      composeService: service.compose_service as string
    }))
    .sort((left, right) => left.serviceId.localeCompare(right.serviceId));
}

export function detectComposeFilePaths(input: {
  readonly repositoryRoot: string;
  readonly contract: RepositoryContract;
}): readonly string[] {
  const paths = new Set<string>();

  for (const service of Object.values(input.contract.services ?? {})) {
    for (const evidence of service.evidence ?? []) {
      const sourcePath = evidence.source_path;

      if (sourcePath !== undefined && isComposeFilePath(sourcePath)) {
        paths.add(join(input.repositoryRoot, sourcePath));
      }
    }
  }

  return [...paths].sort();
}

export function buildComposeUpCommand(input: ComposeCommandInput): RuntimePlannedCommand {
  return composeCommand(input.repositoryRoot, [
    ...composeFileArgs(input.composeFiles ?? []),
    "-p",
    input.projectName,
    "up",
    "-d",
    ...input.services
  ]);
}

export function buildComposePsCommand(
  input: Omit<ComposeCommandInput, "services">
): RuntimePlannedCommand {
  return composeCommand(input.repositoryRoot, [
    ...composeFileArgs(input.composeFiles ?? []),
    "-p",
    input.projectName,
    "ps",
    "--format",
    "json"
  ]);
}

export function buildComposeStopCommand(
  input: Omit<ComposeCommandInput, "services"> & { readonly down?: boolean }
): RuntimePlannedCommand {
  return composeCommand(input.repositoryRoot, [
    ...composeFileArgs(input.composeFiles ?? []),
    "-p",
    input.projectName,
    input.down === true ? "down" : "stop"
  ]);
}

export async function startComposeServices(input: ComposeRunInput): Promise<RuntimeCommandResult> {
  const runCommand = input.runCommand ?? runRuntimeCommand;

  return runCommand({
    id: "compose-up",
    command: buildComposeUpCommand(input),
    env: input.env
  });
}

export async function inspectComposeStatus(input: Omit<ComposeRunInput, "services">): Promise<{
  readonly commandResult: RuntimeCommandResult;
  readonly statuses: readonly ComposeStatus[];
}> {
  const runCommand = input.runCommand ?? runRuntimeCommand;
  const commandResult = await runCommand({
    id: "compose-ps",
    command: buildComposePsCommand(input),
    env: input.env
  });

  return {
    commandResult,
    statuses: parseComposePsJson(commandResult.stdoutExcerpt ?? "")
  };
}

export async function stopComposeProject(
  input: Omit<ComposeRunInput, "services"> & { readonly down?: boolean }
): Promise<RuntimeCommandResult> {
  const runCommand = input.runCommand ?? runRuntimeCommand;

  return runCommand({
    id: input.down === true ? "compose-down" : "compose-stop",
    command: buildComposeStopCommand(input),
    env: input.env
  });
}

export function parseComposePsJson(output: string): readonly ComposeStatus[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => parseComposePsLine(line));
}

function parseComposePsLine(line: string): readonly ComposeStatus[] {
  try {
    const parsed = JSON.parse(line) as unknown;
    const entries = Array.isArray(parsed) ? parsed : [parsed];

    return entries.flatMap((entry) => {
      if (!isComposeStatusObject(entry)) {
        return [];
      }

      return [
        {
          service: entry.Service,
          rawStatus: entry.State,
          status: normalizeComposeStatus(entry.State)
        }
      ];
    });
  } catch {
    return [];
  }
}

function normalizeComposeStatus(status: string): RuntimeStatus {
  const normalized = status.toLowerCase();

  if (normalized.includes("running")) {
    return "running";
  }

  if (normalized.includes("exit") || normalized.includes("dead")) {
    return "failed";
  }

  if (normalized.includes("paused") || normalized.includes("created")) {
    return "pending";
  }

  return "unknown";
}

function composeCommand(repositoryRoot: string, args: readonly string[]): RuntimePlannedCommand {
  return {
    command: "docker",
    args: ["compose", ...args],
    cwd: repositoryRoot,
    shell: false,
    environment: [],
    optional: false
  };
}

function composeFileArgs(composeFiles: readonly string[]): readonly string[] {
  return composeFiles.flatMap((composeFile) => ["-f", composeFile]);
}

function isComposeFilePath(path: string): boolean {
  return /(^|\/)(compose|docker-compose)(\.[a-z0-9_-]+)?\.ya?ml$/i.test(path);
}

function isComposeStatusObject(value: unknown): value is {
  readonly Service: string;
  readonly State: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "Service" in value &&
    "State" in value &&
    typeof value.Service === "string" &&
    typeof value.State === "string"
  );
}
