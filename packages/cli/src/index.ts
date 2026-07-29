#!/usr/bin/env node

import {
  parseRepositoryContractFile,
  RepositoryContractParseError
} from "@repo-knowledge/repository-contract";
import { typesPackage } from "@repo-knowledge/types";

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
  phase: typesPackage.phase
} as const;

export type CliResult = {
  readonly exitCode: 0 | 1;
  readonly stdout: string;
  readonly stderr: string;
};

export function renderHelp(): string {
  return [
    "board",
    "",
    "Usage:",
    "  board <command>",
    "",
    "Commands:",
    ...boardCommands.map((command) => `  ${command}`),
    "",
    "Contract commands:",
    "  board contract validate [path] [--json]",
    "",
    "Phase 0 placeholder: command behavior is implemented in later phases."
  ].join("\n");
}

export function runBoardCli(args: readonly string[]): CliResult {
  const [command] = args;

  if (command === undefined || command === "--help" || command === "-h") {
    return {
      exitCode: 0,
      stdout: renderHelp(),
      stderr: ""
    };
  }

  if (isBoardCommand(command)) {
    return {
      exitCode: 0,
      stdout: `board ${command} is a Phase 0 placeholder. Implementation belongs to a later phase.`,
      stderr: ""
    };
  }

  return {
    exitCode: 1,
    stdout: "",
    stderr: `Unknown command: ${command}\n\n${renderHelp()}`
  };
}

export async function runBoardCliAsync(args: readonly string[]): Promise<CliResult> {
  if (args[0] === "contract" && args[1] === "validate") {
    return validateContractCommand(args.slice(2));
  }

  return runBoardCli(args);
}

async function validateContractCommand(args: readonly string[]): Promise<CliResult> {
  const json = args.includes("--json");
  const filePath = args.find((arg) => arg !== "--json") ?? ".board/repository.yaml";

  try {
    const contract = await parseRepositoryContractFile(filePath);

    if (json) {
      return {
        exitCode: 0,
        stdout: JSON.stringify(
          {
            ok: true,
            path: filePath,
            repository: contract.repository.name
          },
          null,
          2
        ),
        stderr: ""
      };
    }

    return {
      exitCode: 0,
      stdout: `Valid repository contract: ${filePath}`,
      stderr: ""
    };
  } catch (error) {
    const message = formatValidationError(filePath, error, json);

    return {
      exitCode: 1,
      stdout: json ? message : "",
      stderr: json ? "" : message
    };
  }
}

function formatValidationError(filePath: string, error: unknown, json: boolean): string {
  if (error instanceof RepositoryContractParseError) {
    if (json) {
      return JSON.stringify(
        {
          ok: false,
          path: filePath,
          kind: error.kind,
          issues: error.issues,
          message: error.message
        },
        null,
        2
      );
    }

    if (error.issues.length === 0) {
      return `Invalid repository contract: ${filePath}\n${error.message}`;
    }

    return [
      `Invalid repository contract: ${filePath}`,
      ...error.issues.map((issue) => `  ${issue.path}: ${issue.message}`)
    ].join("\n");
  }

  const message = error instanceof Error ? error.message : String(error);

  if (json) {
    return JSON.stringify(
      {
        ok: false,
        path: filePath,
        kind: "read",
        message
      },
      null,
      2
    );
  }

  return `Could not read repository contract: ${filePath}\n${message}`;
}

function isBoardCommand(command: string): command is BoardCommandName {
  return boardCommands.includes(command as BoardCommandName);
}

if (isDirectExecution()) {
  const result = await runBoardCliAsync(process.argv.slice(2));

  if (result.stdout.length > 0) {
    console.log(result.stdout);
  }

  if (result.stderr.length > 0) {
    console.error(result.stderr);
  }

  process.exitCode = result.exitCode;
}

function isDirectExecution(): boolean {
  return (
    process.argv[1] !== undefined && import.meta.url === new URL(process.argv[1], "file:").href
  );
}
