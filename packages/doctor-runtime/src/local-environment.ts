import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";

import type { CommandStep, RepositoryContract } from "@repo-knowledge/repository-contract";

import type { DoctorRepositoryContext } from "./contract-loader.js";

export const localToolKinds = [
  "node",
  "python",
  "docker",
  "docker-compose",
  "package-manager",
  "command"
] as const;

export type LocalToolKind = (typeof localToolKinds)[number];

export const localToolStatuses = ["available", "missing", "unsupported", "unknown"] as const;

export type LocalToolStatus = (typeof localToolStatuses)[number];

export type LocalToolRequirement = {
  readonly id: string;
  readonly kind: LocalToolKind;
  readonly command: string;
  readonly args: readonly string[];
  readonly required: boolean;
  readonly versionRequirement?: string;
};

export type LocalToolObservation = LocalToolRequirement & {
  readonly status: LocalToolStatus;
  readonly versionOutput?: string;
  readonly parsedVersion?: string;
  readonly summary: string;
};

export type LocalEnvironmentVariableObservation = {
  readonly name: string;
  readonly status: "present" | "missing";
  readonly required: boolean;
  readonly secret: boolean;
  readonly usedBy: readonly string[];
  readonly summary: string;
};

export type LocalExpectedFileObservation = {
  readonly path: string;
  readonly status: "present" | "missing";
  readonly reason: string;
};

export type LocalEnvironmentInspection = {
  readonly tools: readonly LocalToolObservation[];
  readonly environment: readonly LocalEnvironmentVariableObservation[];
  readonly expectedFiles: readonly LocalExpectedFileObservation[];
  readonly warnings: readonly string[];
};

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

export type FileExists = (path: string) => Promise<boolean>;

export type InspectLocalEnvironmentInput = {
  readonly context: DoctorRepositoryContext;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly runVersionCommand?: VersionCommandRunner;
  readonly fileExists?: FileExists;
  readonly timeoutMs?: number;
  readonly versionRequirements?: Readonly<Record<string, string>>;
};

const defaultTimeoutMs = 2_500;
const nodeLikeCommands = new Set(["node", "npm", "pnpm", "yarn", "bun", "tsx", "vite", "next"]);
const pythonLikeCommands = new Set(["python", "python3", "pip", "pip3", "uv", "poetry"]);
const packageManagerCommands = new Set([
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "pip",
  "pip3",
  "uv",
  "poetry"
]);

export async function inspectLocalEnvironment(
  input: InspectLocalEnvironmentInput
): Promise<LocalEnvironmentInspection> {
  const contract = input.context.contract;

  if (contract === undefined) {
    return {
      tools: [],
      environment: [],
      expectedFiles: [],
      warnings: [
        "Local environment inspection skipped because the repository contract is unavailable."
      ]
    };
  }

  const runVersionCommand = input.runVersionCommand ?? runDefaultVersionCommand;
  const timeoutMs = input.timeoutMs ?? defaultTimeoutMs;
  const requirements = collectLocalToolRequirements(contract, input.versionRequirements ?? {});
  const tools = await Promise.all(
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
      const output = boundedOutput(result.stdout || result.stderr);
      const parsedVersion = parseVersion(output);
      const status = toolStatus(result, parsedVersion, requirement.versionRequirement);

      return {
        ...requirement,
        status,
        versionOutput: output === "" ? undefined : output,
        parsedVersion,
        summary: summarizeTool(requirement.command, status, result.timedOut)
      } satisfies LocalToolObservation;
    })
  );
  const expectedFiles = await inspectExpectedFiles({
    repositoryRoot: input.context.repositoryRoot,
    requirements,
    fileExists: input.fileExists ?? defaultFileExists
  });

  return {
    tools,
    environment: inspectEnvironmentVariables(contract, input.env ?? process.env),
    expectedFiles,
    warnings: [
      ...tools
        .filter((tool) => tool.required && tool.status === "missing")
        .map((tool) => `${tool.command} is required but missing.`),
      ...tools
        .filter((tool) => tool.required && tool.status === "unsupported")
        .map((tool) => `${tool.command} does not satisfy ${tool.versionRequirement}.`)
    ]
  };
}

export function collectLocalToolRequirements(
  contract: RepositoryContract,
  versionRequirements: Readonly<Record<string, string>> = {}
): readonly LocalToolRequirement[] {
  const commands = new Set<string>();

  if (
    contract.repository.primary_language === "typescript" ||
    contract.repository.primary_language === "javascript"
  ) {
    commands.add("node");
  }

  if (contract.repository.primary_language === "python") {
    commands.add("python3");
  }

  for (const command of collectContractCommands(contract)) {
    commands.add(normalizeCommandName(command.command));
  }

  if (
    Object.values(contract.services ?? {}).some((service) => service.compose_service !== undefined)
  ) {
    commands.add("docker");
    commands.add("docker compose");
  }

  const requirements = new Map<string, LocalToolRequirement>();

  for (const command of commands) {
    if (command === "docker compose") {
      addRequirement(requirements, {
        id: "docker-compose",
        kind: "docker-compose",
        command: "docker",
        args: ["compose", "version"],
        required: true,
        versionRequirement: versionRequirements["docker-compose"]
      });
      continue;
    }

    const kind = kindForCommand(command);
    addRequirement(requirements, {
      id: kind === "package-manager" ? `package-manager-${command}` : command,
      kind,
      command,
      args: ["--version"],
      required: true,
      versionRequirement: versionRequirements[command]
    });
  }

  return [...requirements.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function collectContractCommands(contract: RepositoryContract): readonly CommandStep[] {
  return [
    contract.setup?.install,
    contract.setup?.build_containers,
    contract.setup?.start_services,
    contract.setup?.migrate,
    contract.setup?.seed,
    contract.setup?.generate,
    contract.setup?.health_check,
    contract.setup?.smoke_check,
    ...(contract.setup?.steps ?? []).map((step) => step.command),
    ...Object.values(contract.applications ?? {}).flatMap((application) => [
      application.start,
      application.dev,
      application.build,
      application.health_check?.command
    ]),
    ...Object.values(contract.services ?? {}).flatMap((service) => [service.health_check?.command]),
    ...(contract.verification?.default ?? []).map((check) => check.command),
    ...(contract.verification?.rules ?? []).flatMap((rule) => [
      ...(rule.checks ?? []).map((check) => check.command),
      ...(rule.commands ?? [])
    ]),
    ...(contract.generated_files ?? []).map((path) => path.generated_by)
  ].filter((command): command is CommandStep => command !== undefined);
}

function inspectEnvironmentVariables(
  contract: RepositoryContract,
  env: Readonly<Record<string, string | undefined>>
): readonly LocalEnvironmentVariableObservation[] {
  const usages = collectEnvironmentUsages(contract);

  return [...usages.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, usage]) => {
      const metadata = contract.environment?.[name];
      const required = metadata?.required ?? usage.required;
      const present = env[name] !== undefined && env[name] !== "";

      return {
        name,
        status: present ? "present" : "missing",
        required,
        secret: metadata?.secret ?? looksSecretLikeName(name),
        usedBy: [...usage.usedBy].sort(),
        summary: `${name} is ${present ? "present" : "missing"} and ${required ? "required" : "optional"}.`
      };
    });
}

function collectEnvironmentUsages(
  contract: RepositoryContract
): Map<string, { readonly usedBy: Set<string>; required: boolean }> {
  const usages = new Map<string, { readonly usedBy: Set<string>; required: boolean }>();

  for (const [name, variable] of Object.entries(contract.environment ?? {})) {
    addEnvironmentUsage(usages, name, "contract.environment", variable.required === true);
  }

  for (const application of Object.values(contract.applications ?? {})) {
    for (const name of application.environment ?? []) {
      addEnvironmentUsage(usages, name, `application:${application.id}`, true);
    }
  }

  for (const service of Object.values(contract.services ?? {})) {
    for (const name of service.environment ?? []) {
      addEnvironmentUsage(usages, name, `service:${service.id}`, service.required !== false);
    }
  }

  for (const command of collectContractCommands(contract)) {
    for (const name of command.environment ?? []) {
      addEnvironmentUsage(
        usages,
        name,
        `command:${command.id ?? command.command}`,
        command.optional !== true
      );
    }
  }

  return usages;
}

function addEnvironmentUsage(
  usages: Map<string, { readonly usedBy: Set<string>; required: boolean }>,
  name: string,
  usedBy: string,
  required: boolean
): void {
  const usage = usages.get(name) ?? {
    usedBy: new Set<string>(),
    required: false
  };

  usage.usedBy.add(usedBy);
  usage.required = usage.required || required;
  usages.set(name, usage);
}

async function inspectExpectedFiles(input: {
  readonly repositoryRoot: string;
  readonly requirements: readonly LocalToolRequirement[];
  readonly fileExists: FileExists;
}): Promise<readonly LocalExpectedFileObservation[]> {
  const expected = new Map<string, string>();
  const commandIds = new Set(input.requirements.map((requirement) => requirement.command));

  if (commandIds.has("node")) {
    expected.set("package.json", "Node.js runtime metadata");
  }

  if (commandIds.has("python3") || commandIds.has("python")) {
    expected.set("pyproject.toml", "Python project metadata");
  }

  for (const path of lockfileCandidates(commandIds)) {
    expected.set(path, "package manager lockfile");
  }

  return Promise.all(
    [...expected.entries()].map(async ([path, reason]) => ({
      path,
      status: (await input.fileExists(join(input.repositoryRoot, path))) ? "present" : "missing",
      reason
    }))
  );
}

function lockfileCandidates(commands: ReadonlySet<string>): readonly string[] {
  return [
    ...(commands.has("pnpm") ? ["pnpm-lock.yaml"] : []),
    ...(commands.has("npm") ? ["package-lock.json"] : []),
    ...(commands.has("yarn") ? ["yarn.lock"] : []),
    ...(commands.has("bun") ? ["bun.lock", "bun.lockb"] : []),
    ...(commands.has("uv") ? ["uv.lock"] : []),
    ...(commands.has("poetry") ? ["poetry.lock"] : [])
  ];
}

function addRequirement(
  requirements: Map<string, LocalToolRequirement>,
  requirement: LocalToolRequirement
): void {
  if (!requirements.has(requirement.id)) {
    requirements.set(requirement.id, requirement);
  }
}

function kindForCommand(command: string): LocalToolKind {
  if (command === "node") {
    return "node";
  }

  if (command === "python" || command === "python3") {
    return "python";
  }

  if (command === "docker") {
    return "docker";
  }

  if (packageManagerCommands.has(command)) {
    return "package-manager";
  }

  if (nodeLikeCommands.has(command) || pythonLikeCommands.has(command)) {
    return "command";
  }

  return "command";
}

function toolStatus(
  result: VersionCommandResult,
  parsedVersion: string | undefined,
  versionRequirement: string | undefined
): LocalToolStatus {
  if (result.timedOut) {
    return "unknown";
  }

  if (result.exitCode !== 0) {
    return "missing";
  }

  if (
    versionRequirement !== undefined &&
    parsedVersion !== undefined &&
    !satisfiesMinimumVersion(parsedVersion, versionRequirement)
  ) {
    return "unsupported";
  }

  return "available";
}

function satisfiesMinimumVersion(version: string, requirement: string): boolean {
  const match = requirement.match(/^>=\s*(\d+(?:\.\d+){0,2})$/);

  if (match?.[1] === undefined) {
    return true;
  }

  return compareVersions(version, match[1]) >= 0;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

function summarizeTool(command: string, status: LocalToolStatus, timedOut: boolean): string {
  if (timedOut) {
    return `${command} version check timed out.`;
  }

  if (status === "available") {
    return `${command} is available.`;
  }

  if (status === "unsupported") {
    return `${command} is available but does not satisfy the required version.`;
  }

  if (status === "missing") {
    return `${command} is missing or returned a non-zero version check.`;
  }

  return `${command} availability is unknown.`;
}

function parseVersion(output: string): string | undefined {
  return output.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1];
}

function boundedOutput(output: string): string {
  return output.trim().replace(/\s+/g, " ").slice(0, 240);
}

function normalizeCommandName(command: string): string {
  const first = command.trim().split(/\s+/)[0] ?? command;
  const parts = first.split(/[\\/]/);
  return parts[parts.length - 1] ?? first;
}

function looksSecretLikeName(name: string): boolean {
  return /(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|PRIVATE_KEY|ACCESS_KEY)/.test(name);
}

async function defaultFileExists(path: string): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

async function runDefaultVersionCommand(
  command: string,
  args: readonly string[],
  timeoutMs: number
): Promise<VersionCommandResult> {
  return new Promise((resolveResult) => {
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
