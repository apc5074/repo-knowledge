import { spawn } from "node:child_process";

import {
  defaultRuntimeBudget,
  createBoundedRuntimeExcerpt,
  boundUtf8Tail
} from "@repo-knowledge/bootstrap-runtime";

import type { VerificationCheck, VerificationCheckResult } from "./types.js";

export type VerificationCommandRunnerInput = {
  readonly check: VerificationCheck;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly timeoutSeconds?: number;
  readonly maxOutputBytes?: number;
  readonly redactedValues?: readonly string[];
  readonly signal?: AbortSignal;
};

export async function runVerificationCommand(
  input: VerificationCommandRunnerInput
): Promise<VerificationCheckResult> {
  const startedAt = Date.now();
  const timeoutSeconds =
    input.timeoutSeconds ??
    input.check.command.timeoutSeconds ??
    defaultRuntimeBudget.commandTimeoutSeconds;
  const maxOutputBytes = input.maxOutputBytes ?? defaultRuntimeBudget.outputExcerptBytes;
  const sourceEnvironment = input.env ?? process.env;
  const environmentNames = input.check.command.environment ?? [];
  const env = buildChildEnvironment(environmentNames, sourceEnvironment);
  const selectedEnvironmentValues = environmentNames
    .map((name) => sourceEnvironment[name])
    .filter((value): value is string => value !== undefined && value.length > 0);
  const redactedValues = [...selectedEnvironmentValues, ...(input.redactedValues ?? [])];

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let settled = false;
    const child = spawn(input.check.command.command, input.check.command.args, {
      cwd: input.check.command.cwd,
      env,
      shell: input.check.command.shell,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const timeout =
      timeoutSeconds === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, timeoutSeconds * 1_000);
    const abortListener = () => child.kill("SIGTERM");

    input.signal?.addEventListener("abort", abortListener, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      const excerpt = appendBounded(stdout, chunk, maxOutputBytes);
      stdout = excerpt.text;
      stdoutTruncated ||= excerpt.truncated;
    });
    child.stderr.on("data", (chunk) => {
      const excerpt = appendBounded(stderr, chunk, maxOutputBytes);
      stderr = excerpt.text;
      stderrTruncated ||= excerpt.truncated;
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(
        createVerificationResult(
          input.check,
          startedAt,
          127,
          stdout,
          `${stderr}${error.message}`,
          false,
          redactedValues,
          maxOutputBytes,
          stdoutTruncated,
          stderrTruncated
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
        createVerificationResult(
          input.check,
          startedAt,
          exitCode,
          stdout,
          stderr,
          timedOut,
          redactedValues,
          maxOutputBytes,
          stdoutTruncated,
          stderrTruncated
        )
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

function createVerificationResult(
  check: VerificationCheck,
  startedAt: number,
  exitCode: number | null,
  stdout: string,
  stderr: string,
  timedOut: boolean,
  redactedValues: readonly string[],
  maxOutputBytes: number,
  stdoutTruncated: boolean,
  stderrTruncated: boolean
): VerificationCheckResult {
  const status = timedOut ? "timed_out" : exitCode === 0 ? "passed" : "failed";

  return {
    id: check.id,
    status,
    source: check.source,
    command: check.command,
    selectedBy: check.reason,
    exitCode: exitCode ?? undefined,
    durationMs: Date.now() - startedAt,
    stdoutExcerpt: createBoundedRuntimeExcerpt({
      text: stdout,
      additionalValues: redactedValues,
      maxBytes: maxOutputBytes
    }),
    stderrExcerpt: createBoundedRuntimeExcerpt({
      text: stderr,
      additionalValues: redactedValues,
      maxBytes: maxOutputBytes
    }),
    stdoutTruncated,
    stderrTruncated,
    timedOut,
    evidence: []
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

function appendBounded(
  current: string,
  chunk: string,
  maxBytes: number
): { readonly text: string; readonly truncated: boolean } {
  const next = `${current}${chunk}`;
  const text = boundUtf8Tail(next, maxBytes);
  return {
    text,
    truncated: text !== next
  };
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
