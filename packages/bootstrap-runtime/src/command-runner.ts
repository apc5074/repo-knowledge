import { spawn } from "node:child_process";

import { boundUtf8Tail, redactRuntimeOutput } from "./command-redaction.js";
import { defaultRuntimeBudget } from "./runtime-budget.js";
import type { RuntimeCommandResult, RuntimePlannedCommand } from "./types.js";

export type RuntimeCommandRunnerInput = {
  readonly id: string;
  readonly command: RuntimePlannedCommand;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly timeoutSeconds?: number;
  readonly maxOutputBytes?: number;
  readonly redactedValues?: readonly string[];
  readonly signal?: AbortSignal;
};

export async function runRuntimeCommand(
  input: RuntimeCommandRunnerInput
): Promise<RuntimeCommandResult> {
  const startedAt = Date.now();
  const timeoutSeconds =
    input.timeoutSeconds ??
    input.command.timeoutSeconds ??
    defaultRuntimeBudget.commandTimeoutSeconds;
  const maxOutputBytes = input.maxOutputBytes ?? defaultRuntimeBudget.outputExcerptBytes;
  const sourceEnvironment = input.env ?? process.env;
  const env = buildChildEnvironment(input.command.environment, sourceEnvironment);
  const selectedEnvironmentValues = input.command.environment
    .map((name) => sourceEnvironment[name])
    .filter((value): value is string => value !== undefined && value.length > 0);
  const redactedValues = [...selectedEnvironmentValues, ...(input.redactedValues ?? [])];

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const child = spawn(input.command.command, input.command.args, {
      cwd: input.command.cwd,
      env,
      shell: input.command.shell,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const timeout =
      timeoutSeconds === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, timeoutSeconds * 1_000);
    const abortListener = () => {
      child.kill("SIGTERM");
    };

    input.signal?.addEventListener("abort", abortListener, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk, maxOutputBytes);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk, maxOutputBytes);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(
        createCommandResult(
          input,
          startedAt,
          127,
          stdout,
          `${stderr}${error.message}`,
          false,
          redactedValues
        )
      );
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(
        createCommandResult(input, startedAt, exitCode, stdout, stderr, timedOut, redactedValues)
      );
    });

    function cleanup(): void {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }

      input.signal?.removeEventListener("abort", abortListener);
    }
  });
}

function createCommandResult(
  input: RuntimeCommandRunnerInput,
  startedAt: number,
  exitCode: number | null,
  stdout: string,
  stderr: string,
  timedOut: boolean,
  redactedValues: readonly string[]
): RuntimeCommandResult {
  const status = timedOut ? "timed_out" : exitCode === 0 ? "succeeded" : "failed";

  return {
    id: input.id,
    command: input.command.command,
    args: input.command.args,
    cwd: input.command.cwd,
    status,
    exitCode: exitCode ?? undefined,
    durationMs: Date.now() - startedAt,
    stdoutExcerpt: redactRuntimeOutput({
      text: stdout,
      additionalValues: redactedValues
    }),
    stderrExcerpt: redactRuntimeOutput({
      text: stderr,
      additionalValues: redactedValues
    }),
    timedOut
  };
}

function buildChildEnvironment(
  environmentNames: readonly string[],
  sourceEnvironment: Readonly<Record<string, string | undefined>>
): NodeJS.ProcessEnv {
  const childEnvironment: NodeJS.ProcessEnv = {};

  copyBaseEnvironment(childEnvironment, process.env);

  for (const name of environmentNames) {
    const value = sourceEnvironment[name];

    if (value !== undefined) {
      childEnvironment[name] = value;
    }
  }

  return childEnvironment;
}

function appendBounded(current: string, chunk: string, maxBytes: number): string {
  return boundUtf8Tail(`${current}${chunk}`, maxBytes);
}

function copyBaseEnvironment(
  target: NodeJS.ProcessEnv,
  source: Readonly<Record<string, string | undefined>>
): void {
  const baseNames = [
    "PATH",
    "HOME",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SHELL",
    "SystemRoot",
    "WINDIR",
    "ComSpec"
  ];

  for (const name of baseNames) {
    const value = source[name];

    if (value !== undefined) {
      target[name] = value;
    }
  }
}
