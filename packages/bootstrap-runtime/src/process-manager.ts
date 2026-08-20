import { spawn } from "node:child_process";

import { boundUtf8Tail, redactRuntimeOutput } from "./command-redaction.js";
import type { RuntimeStateStore } from "./state-store.js";
import type {
  BootstrapPlan,
  ManagedProcessRecord,
  RuntimeCommandResult,
  RuntimeEnvironmentResolution,
  RuntimeResource,
  RuntimeStatus,
  RuntimeStep
} from "./types.js";

export type ManagedProcessStartInput = {
  readonly sessionId: string;
  readonly repositoryRoot: string;
  readonly step: RuntimeStep;
  readonly environment?: RuntimeEnvironmentResolution;
  readonly stateStore?: RuntimeStateStore;
  readonly earlyExitMs?: number;
  readonly maxLogBytes?: number;
};

export type ManagedProcessStartResult = {
  readonly status: RuntimeStatus;
  readonly step: RuntimeStep;
  readonly resource?: RuntimeResource;
  readonly process?: ManagedProcessRecord;
  readonly commandResult: RuntimeCommandResult;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

export type ApplicationProcessRunInput = Omit<ManagedProcessStartInput, "step"> & {
  readonly plan: BootstrapPlan;
};

export type ApplicationProcessRunResult = {
  readonly status: RuntimeStatus;
  readonly steps: readonly RuntimeStep[];
  readonly resources: readonly RuntimeResource[];
  readonly processes: readonly ManagedProcessRecord[];
  readonly commandResults: readonly RuntimeCommandResult[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

const defaultEarlyExitMs = 500;
const defaultMaxLogBytes = 8_192;

export async function startApplicationProcesses(
  input: ApplicationProcessRunInput
): Promise<ApplicationProcessRunResult> {
  const starts: ManagedProcessStartResult[] = [];

  for (const step of input.plan.steps.filter((candidate) => candidate.kind === "application")) {
    if (step.command === undefined) {
      continue;
    }

    starts.push(
      await startManagedProcess({
        ...input,
        step
      })
    );
  }

  const startedSteps = new Map(starts.map((start) => [start.step.id, start.step]));

  return {
    status: starts.some((start) => start.status === "failed") ? "failed" : "running",
    steps: input.plan.steps.map((step) => startedSteps.get(step.id) ?? step),
    resources: starts.flatMap((start) => (start.resource === undefined ? [] : [start.resource])),
    processes: starts.flatMap((start) => (start.process === undefined ? [] : [start.process])),
    commandResults: starts.map((start) => start.commandResult),
    warnings: starts.flatMap((start) => start.warnings),
    errors: starts.flatMap((start) => start.errors)
  };
}

export async function startManagedProcess(
  input: ManagedProcessStartInput
): Promise<ManagedProcessStartResult> {
  const command = input.step.command;
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const maxLogBytes = input.maxLogBytes ?? defaultMaxLogBytes;
  const earlyExitMs = input.earlyExitMs ?? defaultEarlyExitMs;

  if (command === undefined) {
    return skippedStart(input, startedAtMs, "No application command is available.");
  }

  if (input.environment?.blockedStepIds.includes(input.step.id) === true) {
    return skippedStart(input, startedAtMs, "Required environment is missing.");
  }

  const sourceEnvironment = input.environment?.values ?? {};
  const childEnvironment = buildChildEnvironment(command.environment, sourceEnvironment);
  const redactedValues = command.environment
    .map((name) => sourceEnvironment[name])
    .filter((value): value is string => value !== undefined && value.length >= 4);
  let stdout = "";
  let stderr = "";

  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: childEnvironment,
      shell: command.shell,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const finish = (result: ManagedProcessStartResult) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(async () => {
      const pid = child.pid;

      if (pid === undefined) {
        finish(
          failedStart(input, startedAtMs, stdout, stderr, redactedValues, "Process PID missing.")
        );
        return;
      }

      const record: ManagedProcessRecord = {
        pid,
        sessionId: input.sessionId,
        repositoryRoot: input.repositoryRoot,
        resourceId: `process-${input.step.id}`,
        applicationId: input.step.id.replace(/^application-/, ""),
        command: command.command,
        args: command.args,
        cwd: command.cwd,
        startedAt,
        stdoutExcerpt: redactRuntimeOutput({
          text: stdout,
          additionalValues: redactedValues
        }),
        stderrExcerpt: redactRuntimeOutput({
          text: stderr,
          additionalValues: redactedValues
        })
      };

      await input.stateStore?.registerProcess(record);
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
      finish({
        status: "running",
        step: completeStep(input.step, "running", `${input.step.id} is running.`),
        resource: {
          id: record.resourceId,
          kind: "process",
          status: "running",
          ownerSessionId: input.sessionId,
          label: input.step.title,
          metadata: {
            pid,
            applicationId: record.applicationId ?? input.step.id
          }
        },
        process: record,
        commandResult: commandResult(
          input,
          startedAtMs,
          "running",
          undefined,
          stdout,
          stderr,
          redactedValues
        ),
        warnings: [],
        errors: []
      });
    }, earlyExitMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout = boundUtf8Tail(`${stdout}${chunk}`, maxLogBytes);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = boundUtf8Tail(`${stderr}${chunk}`, maxLogBytes);
    });
    child.on("error", (error) => {
      finish(failedStart(input, startedAtMs, stdout, `${stderr}${error.message}`, redactedValues));
    });
    child.on("exit", (exitCode) => {
      finish({
        status: "failed",
        step: completeStep(
          input.step,
          "failed",
          `${input.step.id} exited early with code ${exitCode ?? "unknown"}.`
        ),
        commandResult: commandResult(
          input,
          startedAtMs,
          "failed",
          exitCode ?? undefined,
          stdout,
          stderr,
          redactedValues
        ),
        warnings: [],
        errors: [`${input.step.id} exited before it could be tracked.`]
      });
    });
  });
}

export function getManagedProcessStatus(record: ManagedProcessRecord): RuntimeResource {
  return {
    id: record.resourceId,
    kind: "process",
    status: isProcessAlive(record.pid) ? "running" : "stopped",
    ownerSessionId: record.sessionId,
    metadata: {
      pid: record.pid,
      applicationId: record.applicationId ?? record.resourceId
    }
  };
}

export async function stopManagedProcess(input: {
  readonly record: ManagedProcessRecord;
  readonly stateStore?: RuntimeStateStore;
  readonly force?: boolean;
}): Promise<RuntimeResource> {
  if (isProcessAlive(input.record.pid)) {
    process.kill(input.record.pid, input.force === true ? "SIGKILL" : "SIGTERM");
  }

  await input.stateStore?.removeProcess(input.record.pid);

  return {
    id: input.record.resourceId,
    kind: "process",
    status: "stopped",
    ownerSessionId: input.record.sessionId,
    metadata: {
      pid: input.record.pid,
      applicationId: input.record.applicationId ?? input.record.resourceId
    }
  };
}

function skippedStart(
  input: ManagedProcessStartInput,
  startedAtMs: number,
  reason: string
): ManagedProcessStartResult {
  return {
    status: "skipped",
    step: completeStep(input.step, "skipped", reason),
    commandResult: commandResult(input, startedAtMs, "skipped", undefined, "", "", []),
    warnings: [`${input.step.id} skipped: ${reason}`],
    errors: []
  };
}

function failedStart(
  input: ManagedProcessStartInput,
  startedAtMs: number,
  stdout: string,
  stderr: string,
  redactedValues: readonly string[],
  message = "Failed to start process."
): ManagedProcessStartResult {
  return {
    status: "failed",
    step: completeStep(input.step, "failed", message),
    commandResult: commandResult(input, startedAtMs, "failed", 127, stdout, stderr, redactedValues),
    warnings: [],
    errors: [`${input.step.id} failed to start.`]
  };
}

function commandResult(
  input: ManagedProcessStartInput,
  startedAtMs: number,
  status: RuntimeStatus,
  exitCode: number | undefined,
  stdout: string,
  stderr: string,
  redactedValues: readonly string[]
): RuntimeCommandResult {
  return {
    id: input.step.id,
    command: input.step.command?.command ?? "",
    args: input.step.command?.args ?? [],
    cwd: input.step.command?.cwd ?? input.repositoryRoot,
    status,
    exitCode,
    durationMs: Date.now() - startedAtMs,
    stdoutExcerpt: redactRuntimeOutput({
      text: stdout,
      additionalValues: redactedValues
    }),
    stderrExcerpt: redactRuntimeOutput({
      text: stderr,
      additionalValues: redactedValues
    })
  };
}

function completeStep(step: RuntimeStep, status: RuntimeStatus, summary: string): RuntimeStep {
  return {
    ...step,
    status,
    summary,
    startedAt: step.startedAt ?? new Date().toISOString(),
    completedAt: status === "running" ? undefined : new Date().toISOString()
  };
}

function buildChildEnvironment(
  environmentNames: readonly string[],
  sourceEnvironment: Readonly<Record<string, string | undefined>>
): NodeJS.ProcessEnv {
  const childEnvironment: NodeJS.ProcessEnv = {};
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
    const value = process.env[name];

    if (value !== undefined) {
      childEnvironment[name] = value;
    }
  }

  for (const name of environmentNames) {
    const value = sourceEnvironment[name];

    if (value !== undefined) {
      childEnvironment[name] = value;
    }
  }

  return childEnvironment;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
