export type RuntimeBudget = {
  readonly commandTimeoutSeconds: number;
  readonly healthCheckTimeoutMs: number;
  readonly startupTimeoutSeconds: number;
  readonly outputExcerptBytes: number;
  readonly maxSetupSteps: number;
  readonly maxTrackedProcesses: number;
  readonly processReadyProbeMs: number;
};

export type RuntimeBudgetInput = Partial<RuntimeBudget>;

export const defaultRuntimeBudget: RuntimeBudget = {
  commandTimeoutSeconds: 120,
  healthCheckTimeoutMs: 5_000,
  startupTimeoutSeconds: 600,
  outputExcerptBytes: 8_192,
  maxSetupSteps: 25,
  maxTrackedProcesses: 8,
  processReadyProbeMs: 500
};

export function resolveRuntimeBudget(
  input: RuntimeBudgetInput & { readonly startupTimeoutSecondsOverride?: number } = {}
): RuntimeBudget {
  return {
    commandTimeoutSeconds: positiveIntegerOrDefault(
      input.commandTimeoutSeconds,
      defaultRuntimeBudget.commandTimeoutSeconds
    ),
    healthCheckTimeoutMs: positiveIntegerOrDefault(
      input.healthCheckTimeoutMs,
      defaultRuntimeBudget.healthCheckTimeoutMs
    ),
    startupTimeoutSeconds: positiveIntegerOrDefault(
      input.startupTimeoutSecondsOverride ?? input.startupTimeoutSeconds,
      defaultRuntimeBudget.startupTimeoutSeconds
    ),
    outputExcerptBytes: positiveIntegerOrDefault(
      input.outputExcerptBytes,
      defaultRuntimeBudget.outputExcerptBytes
    ),
    maxSetupSteps: positiveIntegerOrDefault(
      input.maxSetupSteps,
      defaultRuntimeBudget.maxSetupSteps
    ),
    maxTrackedProcesses: positiveIntegerOrDefault(
      input.maxTrackedProcesses,
      defaultRuntimeBudget.maxTrackedProcesses
    ),
    processReadyProbeMs: positiveIntegerOrDefault(
      input.processReadyProbeMs,
      defaultRuntimeBudget.processReadyProbeMs
    )
  };
}

function positiveIntegerOrDefault(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
}
