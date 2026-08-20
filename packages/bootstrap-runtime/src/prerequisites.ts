import { spawn } from "node:child_process";

import type {
  BootstrapPlan,
  RuntimePrerequisiteKind,
  RuntimePrerequisiteResult,
  RuntimePrerequisiteStatus
} from "./types.js";

export type VersionCommandResult = {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
};

export type VersionCommandRunner = (
  command: string,
  args: readonly string[],
  timeoutMs: number
) => Promise<VersionCommandResult>;

export type RuntimePrerequisiteInspectionInput = {
  readonly plan: BootstrapPlan;
  readonly runVersionCommand?: VersionCommandRunner;
  readonly timeoutMs?: number;
};

const defaultTimeoutMs = 2_500;
const nodeCommands = new Set(["node", "npm", "pnpm", "yarn", "bun", "tsx", "vite", "next"]);
const pythonCommands = new Set(["python", "python3", "pip", "pip3", "uv", "poetry"]);
const packageManagers = new Set(["npm", "pnpm", "yarn", "bun", "pip", "pip3", "uv", "poetry"]);

export async function inspectRuntimePrerequisites(
  input: RuntimePrerequisiteInspectionInput
): Promise<readonly RuntimePrerequisiteResult[]> {
  const runVersionCommand = input.runVersionCommand ?? runDefaultVersionCommand;
  const timeoutMs = input.timeoutMs ?? defaultTimeoutMs;
  const requirements = collectRuntimePrerequisiteChecks(input.plan);

  return Promise.all(
    requirements.map(async (requirement) => {
      const result = await runVersionCommand(
        requirement.command,
        requirement.args,
        timeoutMs
      ).catch(
        () =>
          ({
            exitCode: null,
            stdout: "",
            stderr: "",
            timedOut: false
          }) satisfies VersionCommandResult
      );
      const status = statusFromVersionResult(result);
      const output = boundedVersionOutput(result.stdout || result.stderr);

      return {
        ...requirement,
        status,
        summary: summarizePrerequisite(requirement.command, status, result.timedOut),
        versionOutput: output === "" ? undefined : output
      };
    })
  );
}

export function attachPrerequisitesToPlan(
  plan: BootstrapPlan,
  prerequisites: readonly RuntimePrerequisiteResult[]
): BootstrapPlan {
  return {
    ...plan,
    prerequisites,
    warnings: [
      ...plan.warnings,
      ...prerequisites
        .filter((prerequisite) => prerequisite.status === "missing")
        .map(
          (prerequisite) =>
            `${prerequisite.id} prerequisite (${prerequisite.command}) is required but was not found.`
        ),
      ...prerequisites
        .filter((prerequisite) => prerequisite.status === "unknown")
        .map(
          (prerequisite) =>
            `${prerequisite.id} prerequisite (${prerequisite.command}) availability could not be confirmed.`
        )
    ]
  };
}

export function collectRuntimePrerequisiteChecks(plan: BootstrapPlan): RuntimePrerequisiteResult[] {
  const commands = new Set(
    plan.steps
      .map((step) => step.command?.command)
      .filter((command): command is string => command !== undefined)
      .map(normalizeCommandName)
  );
  const requirements = new Map<string, RuntimePrerequisiteResult>();

  for (const command of commands) {
    if (nodeCommands.has(command)) {
      addRequirement(requirements, "node", "node", ["--version"], "node");
    }

    if (pythonCommands.has(command)) {
      const pythonCommand =
        command === "python3" ? "python3" : command === "python" ? "python" : "python3";
      addRequirement(requirements, "python", pythonCommand, ["--version"], "python");
    }

    if (packageManagers.has(command)) {
      addRequirement(
        requirements,
        `package-manager-${command}`,
        command,
        ["--version"],
        "package-manager"
      );
    }

    addRequirement(requirements, `command-${command}`, command, ["--version"], "command");
  }

  const needsCompose = plan.resources.some((resource) => resource.kind === "compose-service");

  if (needsCompose) {
    addRequirement(requirements, "docker", "docker", ["--version"], "docker");
    addRequirement(
      requirements,
      "docker-compose",
      "docker",
      ["compose", "version"],
      "docker-compose"
    );
  }

  return [...requirements.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function addRequirement(
  requirements: Map<string, RuntimePrerequisiteResult>,
  id: string,
  command: string,
  args: readonly string[],
  kind: RuntimePrerequisiteKind
): void {
  if (requirements.has(id)) {
    return;
  }

  requirements.set(id, {
    id,
    kind,
    command,
    args,
    status: "unknown",
    required: true,
    summary: "Not inspected yet."
  });
}

function statusFromVersionResult(result: VersionCommandResult): RuntimePrerequisiteStatus {
  if (result.timedOut) {
    return "unknown";
  }

  return result.exitCode === 0 ? "available" : "missing";
}

function summarizePrerequisite(
  command: string,
  status: RuntimePrerequisiteStatus,
  timedOut: boolean
): string {
  if (timedOut) {
    return `${command} version check timed out.`;
  }

  if (status === "available") {
    return `${command} is available.`;
  }

  if (status === "missing") {
    return `${command} is missing or returned a non-zero version check.`;
  }

  return `${command} availability is unknown.`;
}

function boundedVersionOutput(output: string): string {
  return output.trim().replace(/\s+/g, " ").slice(0, 240);
}

function normalizeCommandName(command: string): string {
  const parts = command.split(/[\\/]/);
  return parts[parts.length - 1] ?? command;
}

async function runDefaultVersionCommand(
  command: string,
  args: readonly string[],
  timeoutMs: number
): Promise<VersionCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
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
      resolve({
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
      resolve({
        exitCode,
        stdout,
        stderr,
        timedOut
      });
    });
  });
}
