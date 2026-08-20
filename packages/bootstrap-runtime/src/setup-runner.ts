import { runRuntimeCommand, type RuntimeCommandRunnerInput } from "./command-runner.js";
import type {
  BootstrapPlan,
  RuntimeCommandResult,
  RuntimeEnvironmentResolution,
  RuntimeStatus,
  RuntimeStep
} from "./types.js";

export type RuntimeCommandExecutor = (
  input: RuntimeCommandRunnerInput
) => Promise<RuntimeCommandResult>;

export type SetupRunnerInput = {
  readonly plan: BootstrapPlan;
  readonly environment?: RuntimeEnvironmentResolution;
  readonly runCommand?: RuntimeCommandExecutor;
};

export type SetupRunnerResult = {
  readonly status: RuntimeStatus;
  readonly steps: readonly RuntimeStep[];
  readonly commandResults: readonly RuntimeCommandResult[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

export async function runSetupSteps(input: SetupRunnerInput): Promise<SetupRunnerResult> {
  const runCommand = input.runCommand ?? runRuntimeCommand;
  const setupSteps = input.plan.steps.filter((step) => step.kind === "setup");
  const completedSteps = new Map<string, RuntimeStep>();
  const commandResults: RuntimeCommandResult[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const step of setupSteps) {
    const dependencyBlocker = findFailedRequiredDependency(step, completedSteps);
    const blockedByEnvironment = input.environment?.blockedStepIds.includes(step.id) ?? false;

    if (dependencyBlocker !== undefined) {
      const skipped = completeStep(step, "skipped", `Skipped because ${dependencyBlocker} failed.`);
      completedSteps.set(step.id, skipped);
      warnings.push(`${step.id} skipped because required dependency ${dependencyBlocker} failed.`);
      continue;
    }

    if (blockedByEnvironment) {
      const skipped = completeStep(
        step,
        "skipped",
        "Skipped because required environment is missing."
      );
      completedSteps.set(step.id, skipped);
      errors.push(`${step.id} skipped because required environment is missing.`);
      continue;
    }

    if (step.command === undefined) {
      const skipped = completeStep(step, "skipped", step.skippedReason ?? "No setup command.");
      completedSteps.set(step.id, skipped);
      warnings.push(`${step.id} skipped because no setup command is available.`);
      continue;
    }

    const running = startStep(step);
    completedSteps.set(step.id, running);

    const commandResult = await runCommand({
      id: step.id,
      command: step.command,
      env: input.environment?.values
    });
    commandResults.push(commandResult);

    const completed = completeStep(
      running,
      commandResult.status,
      summarizeSetupResult(step, commandResult)
    );
    completedSteps.set(step.id, completed);

    if (isFailure(commandResult.status)) {
      const message = `${step.id} ${commandResult.status}.`;

      if (step.optional === true) {
        warnings.push(message);
      } else {
        errors.push(message);
      }
    }
  }

  return {
    status: errors.length > 0 ? "failed" : summarizeSetupStatus([...completedSteps.values()]),
    steps: input.plan.steps.map((step) => completedSteps.get(step.id) ?? step),
    commandResults,
    warnings,
    errors
  };
}

function findFailedRequiredDependency(
  step: RuntimeStep,
  completedSteps: ReadonlyMap<string, RuntimeStep>
): string | undefined {
  for (const dependencyId of step.dependsOn) {
    const dependency = completedSteps.get(dependencyId);

    if (dependency !== undefined && dependency.optional !== true && isFailure(dependency.status)) {
      return dependencyId;
    }
  }

  return undefined;
}

function startStep(step: RuntimeStep): RuntimeStep {
  return {
    ...step,
    status: "running",
    startedAt: new Date().toISOString()
  };
}

function completeStep(step: RuntimeStep, status: RuntimeStatus, summary: string): RuntimeStep {
  return {
    ...step,
    status,
    summary,
    completedAt: new Date().toISOString()
  };
}

function summarizeSetupResult(step: RuntimeStep, result: RuntimeCommandResult): string {
  if (result.status === "succeeded") {
    return `${step.id} completed successfully.`;
  }

  if (result.status === "timed_out") {
    return `${step.id} timed out.`;
  }

  return `${step.id} failed with exit code ${result.exitCode ?? "unknown"}.`;
}

function summarizeSetupStatus(steps: readonly RuntimeStep[]): RuntimeStatus {
  if (steps.some((step) => step.optional !== true && isFailure(step.status))) {
    return "failed";
  }

  if (steps.some((step) => step.status === "running")) {
    return "running";
  }

  if (steps.length === 0 || steps.every((step) => step.status === "skipped")) {
    return "skipped";
  }

  return "succeeded";
}

function isFailure(status: RuntimeStatus): boolean {
  return status === "failed" || status === "timed_out";
}
