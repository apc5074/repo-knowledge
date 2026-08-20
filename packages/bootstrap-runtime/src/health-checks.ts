import { runRuntimeCommand, type RuntimeCommandRunnerInput } from "./command-runner.js";
import { redactRuntimeOutput } from "./command-redaction.js";
import { defaultRuntimeBudget } from "./runtime-budget.js";
import type {
  BootstrapPlan,
  RuntimeCommandResult,
  RuntimeEnvironmentResolution,
  RuntimeHealthCheckResult,
  RuntimeStatus,
  RuntimeStep
} from "./types.js";

export type RuntimeHealthCheckRunnerInput = {
  readonly plan: BootstrapPlan;
  readonly enabled?: boolean;
  readonly environment?: RuntimeEnvironmentResolution;
  readonly runCommand?: (input: RuntimeCommandRunnerInput) => Promise<RuntimeCommandResult>;
  readonly fetchUrl?: RuntimeUrlHealthCheckRunner;
  readonly retries?: number;
  readonly timeoutMs?: number;
};

export type RuntimeUrlHealthCheckRunner = (
  url: string,
  timeoutMs: number
) => Promise<{
  readonly status: RuntimeStatus;
  readonly statusCode?: number;
  readonly outputExcerpt?: string;
}>;

const defaultRetries = 2;
const defaultTimeoutMs = defaultRuntimeBudget.healthCheckTimeoutMs;

export async function runRuntimeHealthChecks(
  input: RuntimeHealthCheckRunnerInput
): Promise<readonly RuntimeHealthCheckResult[]> {
  const healthSteps = input.plan.steps.filter((step) => step.kind === "health-check");

  if (input.enabled === false) {
    return healthSteps.map((step) => ({
      id: step.id,
      target: healthCheckTarget(step),
      status: "skipped",
      outputExcerpt: "Health checks were skipped by runtime options."
    }));
  }

  const results: RuntimeHealthCheckResult[] = [];

  for (const step of healthSteps) {
    results.push(await runSingleHealthCheck(step, input));
  }

  return results;
}

async function runSingleHealthCheck(
  step: RuntimeStep,
  input: RuntimeHealthCheckRunnerInput
): Promise<RuntimeHealthCheckResult> {
  const retries = input.retries ?? defaultRetries;
  const timeoutMs = input.timeoutMs ?? defaultTimeoutMs;
  const startedAt = Date.now();

  if (step.command !== undefined) {
    const commandResult = await (input.runCommand ?? runRuntimeCommand)({
      id: step.id,
      command: step.command,
      env: input.environment?.values,
      timeoutSeconds: Math.ceil(timeoutMs / 1_000)
    });

    return {
      id: step.id,
      target: step.command.command,
      status: commandResult.status,
      elapsedMs: Date.now() - startedAt,
      outputExcerpt: commandResult.stdoutExcerpt ?? commandResult.stderrExcerpt
    };
  }

  const target = healthCheckTarget(step);

  if (!isHttpUrl(target)) {
    return {
      id: step.id,
      target,
      status: "skipped",
      elapsedMs: Date.now() - startedAt,
      outputExcerpt: "Health check has no URL or command target."
    };
  }

  let latest:
    | {
        readonly status: RuntimeStatus;
        readonly statusCode?: number;
        readonly outputExcerpt?: string;
      }
    | undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    latest = await (input.fetchUrl ?? fetchUrlHealthCheck)(target, timeoutMs);

    if (latest.status === "succeeded") {
      break;
    }
  }

  return {
    id: step.id,
    target,
    status: latest?.status ?? "unknown",
    elapsedMs: Date.now() - startedAt,
    statusCode: latest?.statusCode,
    outputExcerpt: latest?.outputExcerpt
  };
}

export async function fetchUrlHealthCheck(
  url: string,
  timeoutMs: number
): Promise<{
  readonly status: RuntimeStatus;
  readonly statusCode?: number;
  readonly outputExcerpt?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal
    });

    return {
      status: response.ok ? "succeeded" : "failed",
      statusCode: response.status,
      outputExcerpt: `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      status: error instanceof DOMException && error.name === "AbortError" ? "timed_out" : "failed",
      outputExcerpt: redactRuntimeOutput({
        text: error instanceof Error ? error.message : String(error)
      })
    };
  } finally {
    clearTimeout(timeout);
  }
}

function healthCheckTarget(step: RuntimeStep): string {
  return step.title;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
