import { resolve } from "node:path";

import type { Command } from "commander";

import { resolveContractPath, type ContractPathResult } from "./config/contract-path.js";
import { loadRepositoryContract, type ContractLoadResult } from "./config/contract-loader.js";
import { resolveLocalStatePaths, type LocalStatePaths } from "./config/local-state.js";
import { discoverRepositoryRoot, type RepositoryRootResult } from "./config/repository-root.js";
import { generateSessionId } from "./session.js";
import {
  createNoopTelemetryClient,
  type TelemetryClient,
  type TelemetryClientInput
} from "./telemetry.js";

export type OutputMode = "human" | "json";

export type GlobalCliFlags = {
  readonly json: boolean;
  readonly quiet: boolean;
  readonly verbose: boolean;
  readonly cwd?: string;
  readonly config?: string;
  readonly color: boolean;
};

export type AgentCommandMetadata = {
  readonly agentRunId?: string;
  readonly toolCallId?: string;
  readonly approvalId?: string;
};

export type CommandPrinter = {
  readonly write: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
};

export type CommandContext = {
  readonly currentWorkingDirectory: string;
  readonly startDirectory: string;
  readonly globalFlags: GlobalCliFlags;
  readonly outputMode: OutputMode;
  readonly printer: CommandPrinter;
  readonly env: NodeJS.ProcessEnv;
  readonly repositoryRoot: () => Promise<RepositoryRootResult>;
  readonly contractPath: () => Promise<ContractPathResult>;
  readonly contract: () => Promise<ContractLoadResult>;
  readonly localState: () => Promise<LocalStatePaths>;
  readonly sessionId: string;
  readonly agent: AgentCommandMetadata;
  readonly telemetry: TelemetryClient;
};

export type CommandContextInput = {
  readonly currentWorkingDirectory?: string;
  readonly startDirectory?: string;
  readonly flags?: Partial<GlobalCliFlags>;
  readonly env?: NodeJS.ProcessEnv;
  readonly sessionId?: string;
  readonly agent?: AgentCommandMetadata;
  readonly printer?: CommandPrinter;
  readonly telemetry?: TelemetryClientInput;
};

export function createCommandContext(input: CommandContextInput = {}): CommandContext {
  const env = input.env ?? process.env;
  const currentWorkingDirectory = resolve(input.currentWorkingDirectory ?? process.cwd());
  const flags = normalizeGlobalFlags(input.flags);
  const startDirectory = resolve(input.startDirectory ?? flags.cwd ?? currentWorkingDirectory);
  let repositoryRootResult: Promise<RepositoryRootResult> | undefined;
  let contractPathResult: Promise<ContractPathResult> | undefined;
  let contractResult: Promise<ContractLoadResult> | undefined;
  let localStatePaths: Promise<LocalStatePaths> | undefined;

  return {
    currentWorkingDirectory,
    startDirectory,
    globalFlags: flags,
    outputMode: flags.json ? "json" : "human",
    printer: input.printer ?? noopPrinter,
    env,
    repositoryRoot: () => {
      repositoryRootResult ??= discoverRepositoryRoot(startDirectory);
      return repositoryRootResult;
    },
    contractPath: () => {
      contractPathResult ??= (repositoryRootResult ?? discoverRepositoryRoot(startDirectory)).then(
        (repositoryRoot) =>
          resolveContractPath({
            currentWorkingDirectory,
            explicitPath: flags.config,
            explicitPathSource: "config",
            repositoryRoot
          })
      );
      return contractPathResult;
    },
    contract: () => {
      contractResult ??= (
        contractPathResult ??
        (repositoryRootResult ?? discoverRepositoryRoot(startDirectory)).then((repositoryRoot) =>
          resolveContractPath({
            currentWorkingDirectory,
            explicitPath: flags.config,
            explicitPathSource: "config",
            repositoryRoot
          })
        )
      ).then(loadRepositoryContract);
      return contractResult;
    },
    localState: () => {
      localStatePaths ??= (repositoryRootResult ?? discoverRepositoryRoot(startDirectory)).then(
        (repositoryRoot) =>
          resolveLocalStatePaths({
            env,
            repositoryRoot
          })
      );
      return localStatePaths;
    },
    sessionId: input.sessionId ?? generateSessionId(),
    agent: input.agent ?? {},
    telemetry: createNoopTelemetryClient(
      input.telemetry ?? {
        enabled: isTelemetryEnabled(env)
      }
    )
  };
}

export async function resolveContractPathFromContext(
  context: CommandContext,
  explicitPath?: string
): Promise<ContractPathResult> {
  if (explicitPath === undefined) {
    return context.contractPath();
  }

  return resolveContractPath({
    currentWorkingDirectory: context.currentWorkingDirectory,
    explicitPath,
    explicitPathSource: "argument",
    repositoryRoot: await context.repositoryRoot()
  });
}

export async function loadRepositoryContractFromContext(
  context: CommandContext,
  explicitPath?: string
): Promise<ContractLoadResult> {
  if (explicitPath === undefined) {
    return context.contract();
  }

  return loadRepositoryContract(await resolveContractPathFromContext(context, explicitPath));
}

export function createCommandContextFromCommand(command: Command): CommandContext {
  const globals = getRootCommand(command).opts<Partial<GlobalCliFlags>>();

  return createCommandContext({
    flags: globals
  });
}

function getRootCommand(command: Command): Command {
  let root = command;

  while (root.parent !== null) {
    root = root.parent;
  }

  return root;
}

function normalizeGlobalFlags(flags: Partial<GlobalCliFlags> = {}): GlobalCliFlags {
  return {
    json: Boolean(flags.json),
    quiet: Boolean(flags.quiet),
    verbose: Boolean(flags.verbose),
    cwd: flags.cwd,
    config: flags.config,
    color: flags.color === true && process.stdout.isTTY === true
  };
}

const noopPrinter: CommandPrinter = {
  write: () => {},
  warn: () => {},
  error: () => {}
};

function isTelemetryEnabled(env: NodeJS.ProcessEnv): boolean {
  return ["1", "true", "yes", "on"].includes((env.BOARD_TELEMETRY ?? "").toLowerCase());
}
