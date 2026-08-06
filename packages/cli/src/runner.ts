import type { CommandContext } from "./command-context.js";
import { boardErrorToResult, isBoardError, unexpectedErrorToResult } from "./errors/board-error.js";
import { exitCodes } from "./errors/exit-codes.js";
import { printCommandResult } from "./output/printer.js";
import { buildCommandResult, type CommandResult } from "./output/result.js";

export type CliResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type CommandHandler<TData = unknown> = (
  context: CommandContext
) => CommandResult<TData> | Promise<CommandResult<TData>>;

export type SyncCommandHandler<TData = unknown> = (context: CommandContext) => CommandResult<TData>;

export type RunCommandInput<TData = unknown> = {
  readonly command: string;
  readonly context: CommandContext;
  readonly handler: CommandHandler<TData>;
};

export async function runCommand<TData = unknown>(
  input: RunCommandInput<TData>
): Promise<CliResult> {
  const start = Date.now();

  try {
    const result = withDuration(await input.handler(input.context), start);
    const output = printCommandResult(input.context, result);

    input.context.telemetry.capture("command.completed", {
      command: input.command,
      ok: result.ok,
      duration_ms: result.duration_ms
    });
    await input.context.telemetry.flush?.();

    return {
      exitCode: result.ok ? exitCodes.success : exitCodes.generalFailure,
      stdout: result.ok || input.context.outputMode === "json" ? output : "",
      stderr: result.ok || input.context.outputMode === "json" ? "" : output
    };
  } catch (error) {
    const result = isBoardError(error)
      ? withDuration(boardErrorToResult(input.context, input.command, error), start)
      : withDuration(unexpectedErrorToResult(input.context, input.command, error), start);
    const output = printCommandResult(input.context, result);

    input.context.telemetry.capture("command.failed", {
      command: input.command,
      ok: false,
      duration_ms: result.duration_ms,
      error_code: result.errors[0]?.code
    });
    await input.context.telemetry.flush?.();

    return {
      exitCode: isBoardError(error) ? error.exitCode : exitCodes.unexpectedInternalError,
      stdout: input.context.outputMode === "json" ? output : "",
      stderr: input.context.outputMode === "json" ? "" : output
    };
  }
}

export function runCommandSync<TData = unknown>(
  input: Omit<RunCommandInput<TData>, "handler"> & {
    readonly handler: SyncCommandHandler<TData>;
  }
): CliResult {
  const start = Date.now();

  try {
    const result = withDuration(input.handler(input.context), start);
    const output = printCommandResult(input.context, result);

    input.context.telemetry.capture("command.completed", {
      command: input.command,
      ok: result.ok,
      duration_ms: result.duration_ms
    });
    void input.context.telemetry.flush?.();

    return {
      exitCode: result.ok ? exitCodes.success : exitCodes.generalFailure,
      stdout: result.ok || input.context.outputMode === "json" ? output : "",
      stderr: result.ok || input.context.outputMode === "json" ? "" : output
    };
  } catch (error) {
    const result = isBoardError(error)
      ? withDuration(boardErrorToResult(input.context, input.command, error), start)
      : withDuration(unexpectedErrorToResult(input.context, input.command, error), start);
    const output = printCommandResult(input.context, result);

    input.context.telemetry.capture("command.failed", {
      command: input.command,
      ok: false,
      duration_ms: result.duration_ms,
      error_code: result.errors[0]?.code
    });
    void input.context.telemetry.flush?.();

    return {
      exitCode: isBoardError(error) ? error.exitCode : exitCodes.unexpectedInternalError,
      stdout: input.context.outputMode === "json" ? output : "",
      stderr: input.context.outputMode === "json" ? "" : output
    };
  }
}

function withDuration<TData>(result: CommandResult<TData>, start: number): CommandResult<TData> {
  return buildCommandResult({
    ...result,
    duration_ms: Date.now() - start
  });
}
