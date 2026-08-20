import { createRequire } from "node:module";

import { Command, CommanderError } from "commander";

import { typesPackage } from "@repo-knowledge/types";

import { createCommandContext, createCommandContextFromCommand } from "./command-context.js";
import { validateContractCommand } from "./commands/contract/validate.js";
import { initCommand } from "./commands/init.js";
import { buildPlaceholderCommandResult, mvpPlaceholderCommands } from "./commands/placeholders.js";
import { scanCommand } from "./commands/scan.js";
import { startCommand } from "./commands/start.js";
import { statusCommand } from "./commands/status.js";
import { stopCommand } from "./commands/stop.js";
import { installInterruptHandlers } from "./interrupt.js";
import { buildSuccessResult } from "./output/result.js";
import { printCommandResult } from "./output/printer.js";
import { runCommand, runCommandSync, type CliResult } from "./runner.js";

export type { CliResult } from "./runner.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { readonly version: string };

export const boardCommands = [
  ...mvpPlaceholderCommands.slice(0, 3),
  "scan",
  ...mvpPlaceholderCommands.slice(3, 7),
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

  for (const command of mvpPlaceholderCommands) {
    if (command === "init" || command === "start" || command === "status" || command === "stop") {
      continue;
    }

    const registeredCommand = program
      .command(command)
      .description(`${command} command placeholder`)
      .action(() => {
        const context = createCommandContextFromCommand(registeredCommand);

        options.onResult?.(
          runCommandSync({
            command,
            context,
            handler: () => buildPlaceholderCommandResult(command, context)
          })
        );
      });
  }

  program
    .command("start")
    .description("Start local repository resources from the Board contract")
    .option("--dry-run", "preview the runtime execution plan without running commands")
    .option("--skip-setup", "skip setup commands before starting services and apps")
    .option("--only <id>", "limit runtime execution to one application or service id")
    .option("--no-health-check", "skip runtime health checks")
    .option(
      "--timeout <seconds>",
      "set the runtime timeout budget in seconds",
      parsePositiveInteger
    )
    .option("--json", "emit machine-readable JSON output")
    .action(
      async (commandOptions: {
        readonly dryRun?: boolean;
        readonly skipSetup?: boolean;
        readonly only?: string;
        readonly healthCheck?: boolean;
        readonly timeout?: number;
        readonly json?: boolean;
      }) => {
        const globals = program.opts<{
          readonly json?: boolean;
          readonly quiet?: boolean;
          readonly verbose?: boolean;
          readonly cwd?: string;
          readonly config?: string;
          readonly color?: boolean;
        }>();
        const context = createCommandContext({
          flags: {
            ...globals,
            json: Boolean(commandOptions.json ?? globals.json)
          }
        });

        const interrupt = installInterruptHandlers(process);

        try {
          programOptions.onResult?.(
            await runCommand({
              command: "start",
              context,
              handler: () =>
                startCommand(context, {
                  ...commandOptions,
                  interruptSignal: interrupt.signal
                })
            })
          );
        } finally {
          interrupt.dispose();
        }
      }
    );

  program
    .command("init")
    .description("Create a reviewable repository contract proposal")
    .option("--dry-run", "preview proposed files without writing to disk")
    .option("--write", "write the proposed artifacts to disk")
    .option("--force", "allow writes when target files have local changes")
    .option("--include-untracked", "include untracked files in the scan inventory")
    .option("--skip-scripts", "skip script proposal generation")
    .option("--contract <path>", "set the repository contract path")
    .option("--json", "emit machine-readable JSON output")
    .action(
      async (commandOptions: {
        readonly dryRun?: boolean;
        readonly write?: boolean;
        readonly force?: boolean;
        readonly includeUntracked?: boolean;
        readonly skipScripts?: boolean;
        readonly contract?: string;
        readonly json?: boolean;
      }) => {
        const globals = program.opts<{
          readonly json?: boolean;
          readonly quiet?: boolean;
          readonly verbose?: boolean;
          readonly cwd?: string;
          readonly config?: string;
          readonly color?: boolean;
        }>();
        const context = createCommandContext({
          flags: {
            ...globals,
            json: Boolean(commandOptions.json ?? globals.json)
          }
        });

        programOptions.onResult?.(
          await runCommand({
            command: "init",
            context,
            handler: () => initCommand(context, commandOptions)
          })
        );
      }
    );

  program
    .command("status")
    .description("Report local repository and contract readiness")
    .option("--session <session-id>", "report a specific runtime session")
    .option("--json", "emit machine-readable JSON output")
    .action(async (commandOptions: { readonly session?: string; readonly json?: boolean }) => {
      const globals = program.opts<{
        readonly json?: boolean;
        readonly quiet?: boolean;
        readonly verbose?: boolean;
        readonly cwd?: string;
        readonly config?: string;
        readonly color?: boolean;
      }>();
      const context = createCommandContext({
        flags: {
          ...globals,
          json: Boolean(commandOptions.json ?? globals.json)
        }
      });

      programOptions.onResult?.(
        await runCommand({
          command: "status",
          context,
          handler: () => statusCommand(context, commandOptions)
        })
      );
    });

  program
    .command("scan")
    .description("Scan repository facts for debugging and future init workflows")
    .option("--json", "emit machine-readable JSON output")
    .option("--include-untracked", "include untracked files in the scan inventory")
    .action(
      async (commandOptions: { readonly json?: boolean; readonly includeUntracked?: boolean }) => {
        const globals = program.opts<{
          readonly json?: boolean;
          readonly quiet?: boolean;
          readonly verbose?: boolean;
          readonly cwd?: string;
          readonly config?: string;
          readonly color?: boolean;
        }>();
        const context = createCommandContext({
          flags: {
            ...globals,
            json: Boolean(commandOptions.json ?? globals.json)
          }
        });

        programOptions.onResult?.(
          await runCommand({
            command: "scan",
            context,
            handler: () =>
              scanCommand(context, {
                includeUntracked: commandOptions.includeUntracked
              })
          })
        );
      }
    );

  const contract = program.command("contract").description("Repository contract commands");

  contract.action(() => {
    const context = createCommandContextFromCommand(contract);

    options.onResult?.(
      runCommandSync({
        command: "contract",
        context,
        handler: () => buildPlaceholderCommandResult("contract", context)
      })
    );
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
          await runCommand({
            command: "contract validate",
            context,
            handler: () =>
              validateContractCommand(
                filePath,
                Boolean(commandOptions.json ?? globals?.json),
                context
              )
          })
        );
      }
    );

  program
    .command("stop")
    .description("Stop Board-managed local runtime resources")
    .option("--session <session-id>", "stop a specific runtime session")
    .option("--all", "stop all Board-managed runtime sessions for this repository")
    .option("--force", "force stop Board-managed processes")
    .option("--json", "emit machine-readable JSON output")
    .action(
      async (commandOptions: {
        readonly session?: string;
        readonly all?: boolean;
        readonly force?: boolean;
        readonly json?: boolean;
      }) => {
        const globals = program.opts<{
          readonly json?: boolean;
          readonly quiet?: boolean;
          readonly verbose?: boolean;
          readonly cwd?: string;
          readonly config?: string;
          readonly color?: boolean;
        }>();
        const context = createCommandContext({
          flags: {
            ...globals,
            json: Boolean(commandOptions.json ?? globals.json)
          }
        });

        programOptions.onResult?.(
          await runCommand({
            command: "stop",
            context,
            handler: () => stopCommand(context, commandOptions)
          })
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

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CommanderError(2, "board.invalid-argument", "Timeout must be a positive integer.");
  }

  return parsed;
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
