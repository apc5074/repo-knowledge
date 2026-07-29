import { createRequire } from "node:module";

import { Command, CommanderError } from "commander";

import { typesPackage } from "@repo-knowledge/types";

import {
  createCommandContext,
  createCommandContextFromCommand,
  loadRepositoryContractFromContext,
  type CommandContext
} from "./command-context.js";
import { buildFailureResult, buildSuccessResult } from "./output/result.js";
import { printCommandResult } from "./output/printer.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { readonly version: string };

export const boardCommands = [
  "init",
  "start",
  "status",
  "doctor",
  "explain",
  "task",
  "verify",
  "contract",
  "stop"
] as const;

export type BoardCommandName = (typeof boardCommands)[number];

export const cliPackage = {
  name: "@repo-knowledge/cli",
  binary: "board",
  version: packageJson.version,
  phase: typesPackage.phase
} as const;

export type CliResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type VersionInfo = {
  readonly version: string;
  readonly node?: string;
  readonly platform?: string;
  readonly arch?: string;
};

type BoardProgramOptions = {
  readonly onResult?: (result: CliResult) => void;
};

type CommandOutputConfiguration = {
  readonly writeOut: (text: string) => void;
  readonly writeErr: (text: string) => void;
};

export function getVersionInfo(verbose = false): VersionInfo {
  if (!verbose) {
    return {
      version: cliPackage.version
    };
  }

  return {
    version: cliPackage.version,
    node: process.version,
    platform: process.platform,
    arch: process.arch
  };
}

export function renderHelp(): string {
  return createBoardProgram().helpInformation().trimEnd();
}

export function createBoardProgram(options: BoardProgramOptions = {}): Command {
  const programOptions = options;
  const program = new Command();

  program
    .name("board")
    .description("Repository readiness CLI for humans and coding agents.")
    .showHelpAfterError()
    .exitOverride()
    .helpOption("-h, --help", "display help for command")
    .option("--json", "emit machine-readable JSON output")
    .option("--quiet", "suppress nonessential human output")
    .option("--verbose", "include local diagnostic details")
    .option("--cwd <path>", "set the starting directory for repository discovery")
    .option("--config <path>", "set the repository contract path")
    .option("--no-color", "disable terminal colors")
    .option("-V, --version", "output the CLI version");

  for (const command of boardCommands) {
    if (command === "contract") {
      continue;
    }

    const registeredCommand = program
      .command(command)
      .description(`${command} command placeholder`)
      .action(() => {
        options.onResult?.(
          placeholderCommand(command, createCommandContextFromCommand(registeredCommand))
        );
      });
  }

  const contract = program.command("contract").description("Repository contract commands");

  contract.action(() => {
    options.onResult?.(placeholderCommand("contract", createCommandContextFromCommand(contract)));
  });

  contract
    .command("validate")
    .description("Validate a .board/repository.yaml contract")
    .argument("[path]", "contract path")
    .option("--json", "emit machine-readable JSON output")
    .action(
      async (
        filePath: string | undefined,
        commandOptions: { readonly json?: boolean },
        command: Command
      ) => {
        const globals = command.parent?.parent?.opts<{ readonly json?: boolean }>();
        const context = createCommandContextFromCommand(command);

        programOptions.onResult?.(
          await validateContractCommand(
            filePath,
            Boolean(commandOptions.json ?? globals?.json),
            context
          )
        );
      }
    );

  return program;
}

export function runBoardCli(args: readonly string[]): CliResult {
  if (args.includes("--version") || args.includes("-V")) {
    return renderVersion(args);
  }

  return runProgram(args);
}

export async function runBoardCliAsync(args: readonly string[]): Promise<CliResult> {
  if (args.includes("--version") || args.includes("-V")) {
    return renderVersion(args);
  }

  return runProgramAsync(args);
}

function runProgram(args: readonly string[]): CliResult {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let result: CliResult | undefined;
  const program = createConfiguredProgram(stdout, stderr, (commandResult) => {
    result = commandResult;
  });

  try {
    program.parse(args, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      return {
        exitCode: error.exitCode,
        stdout: stdout.join("").trimEnd(),
        stderr: stderr.join("").trimEnd()
      };
    }

    throw error;
  }

  return (
    result ?? {
      exitCode: 0,
      stdout: stdout.join("").trimEnd(),
      stderr: stderr.join("").trimEnd()
    }
  );
}

async function runProgramAsync(args: readonly string[]): Promise<CliResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let result: CliResult | undefined;
  const program = createConfiguredProgram(stdout, stderr, (commandResult) => {
    result = commandResult;
  });

  try {
    await program.parseAsync(args, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      return {
        exitCode: error.exitCode,
        stdout: stdout.join("").trimEnd(),
        stderr: stderr.join("").trimEnd()
      };
    }

    throw error;
  }

  return (
    result ?? {
      exitCode: 0,
      stdout: stdout.join("").trimEnd(),
      stderr: stderr.join("").trimEnd()
    }
  );
}

function createConfiguredProgram(
  stdout: string[],
  stderr: string[],
  onResult: (result: CliResult) => void
): Command {
  const program = createBoardProgram({ onResult });
  const outputConfiguration = {
    writeOut: (text: string) => {
      stdout.push(text);
    },
    writeErr: (text: string) => {
      stderr.push(text);
    }
  };

  configureOutputRecursively(program, outputConfiguration);

  return program;
}

function configureOutputRecursively(
  command: Command,
  outputConfiguration: CommandOutputConfiguration
): void {
  command.configureOutput(outputConfiguration);

  for (const subcommand of command.commands) {
    configureOutputRecursively(subcommand, outputConfiguration);
  }
}

function placeholderCommand(command: BoardCommandName, context: CommandContext): CliResult {
  void context;

  return {
    exitCode: 0,
    stdout: `board ${command} is a Phase 2 placeholder. Implementation belongs to a later phase.`,
    stderr: ""
  };
}

async function validateContractCommand(
  filePath: string | undefined,
  json: boolean,
  context: CommandContext
): Promise<CliResult> {
  const result = await loadRepositoryContractFromContext(context, filePath);

  if (!result.ok) {
    const message = formatContractLoadError(result, json);
    return {
      exitCode: result.exitCode,
      stdout: json ? message : "",
      stderr: json ? "" : message
    };
  }

  if (json) {
    const commandResult = buildSuccessResult(context, {
      command: "contract validate",
      summary: `Valid repository contract: ${result.path}`,
      data: {
        path: result.path,
        repository: result.contract.repository.name
      },
      repository: {
        name: result.contract.repository.name
      },
      contract: {
        path: result.path,
        valid: true
      }
    });

    return {
      exitCode: 0,
      stdout: printCommandResult(context, commandResult),
      stderr: ""
    };
  }

  const commandResult = buildSuccessResult(context, {
    command: "contract validate",
    summary: `Valid repository contract: ${result.path}`,
    repository: {
      name: result.contract.repository.name
    },
    contract: {
      path: result.path,
      valid: true
    }
  });

  return {
    exitCode: 0,
    stdout: printCommandResult(context, commandResult),
    stderr: ""
  };
}

function renderVersion(args: readonly string[]): CliResult {
  const context = createCommandContext({
    flags: {
      json: args.includes("--json"),
      verbose: args.includes("--verbose")
    }
  });
  const version = getVersionInfo(args.includes("--verbose"));
  const commandResult = buildSuccessResult(context, {
    command: "version",
    summary: version.version,
    data: version
  });

  if (args.includes("--json")) {
    return {
      exitCode: 0,
      stdout: printCommandResult(context, commandResult),
      stderr: ""
    };
  }

  return {
    exitCode: 0,
    stdout: printCommandResult(context, commandResult),
    stderr: ""
  };
}

function formatContractLoadError(
  error: Exclude<
    Awaited<ReturnType<typeof loadRepositoryContractFromContext>>,
    { readonly ok: true }
  >,
  json: boolean
): string {
  const context = createCommandContext({
    flags: {
      json
    }
  });
  const commandResult = buildFailureResult(context, {
    command: "contract validate",
    summary: `Could not load repository contract${error.path ? `: ${error.path}` : ""}`,
    errors: [
      {
        code: error.reason,
        message: error.message,
        path: error.path,
        details: error.issues
      },
      ...error.issues.map((issue) => ({
        code: "contract-issue",
        message: `${issue.path}: ${issue.message}`,
        path: issue.path
      }))
    ],
    next_steps: error.nextSteps,
    contract: {
      path: error.path,
      valid: false
    }
  });

  if (json) {
    return printCommandResult(context, commandResult);
  }

  return printCommandResult(context, commandResult);
}
