import type { CommandContext } from "../command-context.js";
import { buildFailureResult, type CommandResult } from "../output/result.js";
import { exitCodes, type ExitCode } from "./exit-codes.js";

export type BoardErrorCode =
  | "usage-error"
  | "repository-not-found"
  | "contract-not-found"
  | "contract-invalid"
  | "command-not-implemented"
  | "external-command-failed"
  | "interrupted"
  | "permission-or-access"
  | "unexpected-internal-error";

export type BoardErrorInput = {
  readonly code: BoardErrorCode;
  readonly exitCode: ExitCode;
  readonly message: string;
  readonly details?: unknown;
  readonly metadata?: Record<string, unknown>;
  readonly nextSteps?: readonly string[];
};

export class BoardError extends Error {
  readonly code: BoardErrorCode;
  readonly exitCode: ExitCode;
  readonly details?: unknown;
  readonly metadata: Record<string, unknown>;
  readonly nextSteps: readonly string[];

  constructor(input: BoardErrorInput) {
    super(input.message);
    this.name = "BoardError";
    this.code = input.code;
    this.exitCode = input.exitCode;
    this.details = input.details;
    this.metadata = input.metadata ?? {};
    this.nextSteps = input.nextSteps ?? [];
  }
}

export function usageError(message: string, nextSteps: readonly string[] = []): BoardError {
  return new BoardError({
    code: "usage-error",
    exitCode: exitCodes.usageError,
    message,
    nextSteps
  });
}

export function repositoryNotFoundError(
  message: string,
  nextSteps: readonly string[] = ["Run board init from the repository root."]
): BoardError {
  return new BoardError({
    code: "repository-not-found",
    exitCode: exitCodes.repositoryNotFound,
    message,
    nextSteps
  });
}

export function contractNotFoundError(
  message: string,
  path?: string,
  nextSteps: readonly string[] = ["Run board init to create .board/repository.yaml."]
): BoardError {
  return new BoardError({
    code: "contract-not-found",
    exitCode: exitCodes.contractNotFound,
    message,
    metadata: path === undefined ? {} : { path },
    nextSteps
  });
}

export function contractInvalidError(
  message: string,
  path?: string,
  details?: unknown,
  nextSteps: readonly string[] = [
    "Fix the contract issues above, then run board contract validate again."
  ]
): BoardError {
  return new BoardError({
    code: "contract-invalid",
    exitCode: exitCodes.contractInvalid,
    message,
    details,
    metadata: path === undefined ? {} : { path },
    nextSteps
  });
}

export function commandNotImplementedError(command: string): BoardError {
  return new BoardError({
    code: "command-not-implemented",
    exitCode: exitCodes.commandNotImplemented,
    message: `board ${command} is not implemented yet.`,
    metadata: { command },
    nextSteps: ["Use an implemented command or add the command handler before exposing it."]
  });
}

export function externalCommandFailedError(message: string, details?: unknown): BoardError {
  return new BoardError({
    code: "external-command-failed",
    exitCode: exitCodes.externalCommandFailed,
    message,
    details
  });
}

export function interruptedError(message = "Command interrupted."): BoardError {
  return new BoardError({
    code: "interrupted",
    exitCode: exitCodes.interrupted,
    message
  });
}

export function permissionOrAccessError(message: string, path?: string): BoardError {
  return new BoardError({
    code: "permission-or-access",
    exitCode: exitCodes.permissionOrAccess,
    message,
    metadata: path === undefined ? {} : { path },
    nextSteps: ["Check file permissions, then run the command again."]
  });
}

export function unexpectedInternalError(message: string, details?: unknown): BoardError {
  return new BoardError({
    code: "unexpected-internal-error",
    exitCode: exitCodes.unexpectedInternalError,
    message,
    details
  });
}

export function isBoardError(error: unknown): error is BoardError {
  return error instanceof BoardError;
}

export function boardErrorToResult(
  context: CommandContext,
  command: string,
  error: BoardError
): CommandResult {
  const path = typeof error.metadata.path === "string" ? error.metadata.path : undefined;
  const detailIssues = Array.isArray(error.details)
    ? error.details.filter(isIssueLike).map((issue) => ({
        code: "contract-issue",
        message: `${issue.path}: ${issue.message}`,
        path: issue.path
      }))
    : [];

  return buildFailureResult(context, {
    command,
    summary: error.message,
    errors: [
      {
        code: error.code,
        message: error.message,
        path,
        details: error.details
      },
      ...detailIssues
    ],
    next_steps: error.nextSteps,
    contract: path === undefined ? undefined : { path, valid: false }
  });
}

function isIssueLike(value: unknown): value is { readonly path: string; readonly message: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    "path" in value &&
    typeof value.path === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

export function unexpectedErrorToResult(
  context: CommandContext,
  command: string,
  error: unknown
): CommandResult {
  const message = error instanceof Error ? error.message : String(error);
  const details =
    context.globalFlags.verbose && error instanceof Error
      ? {
          name: error.name,
          stack: error.stack
        }
      : undefined;

  return buildFailureResult(context, {
    command,
    summary: "Unexpected internal error.",
    errors: [
      {
        code: "unexpected-internal-error",
        message,
        details
      }
    ],
    next_steps: ["Rerun with --verbose for safe diagnostic details."]
  });
}
