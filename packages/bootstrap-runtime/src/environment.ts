import type { RepositoryContract } from "@repo-knowledge/repository-contract";

import type {
  BootstrapPlan,
  RuntimeEnvironmentResolution,
  RuntimeEnvironmentVariableResult,
  RuntimeStep
} from "./types.js";

export type RuntimeEnvironmentResolutionInput = {
  readonly contract: RepositoryContract;
  readonly plan: BootstrapPlan;
  readonly env?: Readonly<Record<string, string | undefined>>;
};

export function resolveRuntimeEnvironment(
  input: RuntimeEnvironmentResolutionInput
): RuntimeEnvironmentResolution {
  const sourceEnvironment = input.env ?? process.env;
  const usages = collectEnvironmentUsages(input.contract, input.plan);
  const variables = [...usages.keys()].sort().map((name) => {
    const metadata = input.contract.environment?.[name];
    const usage = usages.get(name);
    const usedByStepIds = [...(usage?.stepIds ?? new Set<string>())].sort();
    const value = sourceEnvironment[name];
    const required =
      metadata?.required ?? [...(usage?.requiredByStepIds ?? new Set<string>())].length > 0;
    const status = value === undefined || value === "" ? "missing" : "present";

    return {
      name,
      status,
      required,
      secret: metadata?.secret ?? looksSecretLikeName(name),
      usedByStepIds,
      hasLocalDefault: metadata?.default_for_local !== undefined,
      summary: summarizeEnvironmentVariable(name, status, required, usedByStepIds)
    } satisfies RuntimeEnvironmentVariableResult;
  });
  const missingRequiredNames = variables
    .filter((variable) => variable.required && variable.status === "missing")
    .map((variable) => variable.name);
  const missingOptionalNames = variables
    .filter((variable) => !variable.required && variable.status === "missing")
    .map((variable) => variable.name);
  const blockedStepIds = [
    ...new Set(
      missingRequiredNames.flatMap((name) => [...(usages.get(name)?.requiredByStepIds ?? [])])
    )
  ].sort();

  return {
    variables,
    values: Object.fromEntries(
      variables
        .filter((variable) => variable.status === "present")
        .map((variable) => [variable.name, sourceEnvironment[variable.name] as string])
    ),
    missingRequiredNames,
    missingOptionalNames,
    blockedStepIds,
    warnings: missingOptionalNames.map(
      (name) => `${name} is optional for local runtime and is not set.`
    ),
    errors: missingRequiredNames.map(
      (name) => `${name} is required for local runtime and is not set.`
    )
  };
}

function collectEnvironmentUsages(
  contract: RepositoryContract,
  plan: BootstrapPlan
): Map<
  string,
  {
    readonly stepIds: Set<string>;
    readonly requiredByStepIds: Set<string>;
  }
> {
  const usages = new Map<
    string,
    {
      readonly stepIds: Set<string>;
      readonly requiredByStepIds: Set<string>;
    }
  >();

  for (const name of Object.keys(contract.environment ?? {})) {
    addUsage(usages, name);
  }

  for (const service of Object.values(contract.services ?? {})) {
    for (const name of service.environment ?? []) {
      addUsage(usages, name, `service-${service.id}`, service.required !== false);
    }
  }

  for (const application of Object.values(contract.applications ?? {})) {
    for (const name of application.environment ?? []) {
      addUsage(usages, name, `application-${application.id}`, true);
    }
  }

  for (const step of plan.steps) {
    collectStepEnvironment(usages, step);
  }

  return usages;
}

function collectStepEnvironment(
  usages: Map<string, { readonly stepIds: Set<string>; readonly requiredByStepIds: Set<string> }>,
  step: RuntimeStep
): void {
  for (const name of step.command?.environment ?? []) {
    addUsage(usages, name, step.id, step.optional !== true);
  }
}

function addUsage(
  usages: Map<string, { readonly stepIds: Set<string>; readonly requiredByStepIds: Set<string> }>,
  name: string,
  stepId?: string,
  requiredByStep = false
): void {
  const usage = usages.get(name) ?? {
    stepIds: new Set<string>(),
    requiredByStepIds: new Set<string>()
  };

  if (stepId !== undefined) {
    usage.stepIds.add(stepId);

    if (requiredByStep) {
      usage.requiredByStepIds.add(stepId);
    }
  }

  usages.set(name, usage);
}

function summarizeEnvironmentVariable(
  name: string,
  status: RuntimeEnvironmentVariableResult["status"],
  required: boolean,
  usedByStepIds: readonly string[]
): string {
  const requirement = required ? "required" : "optional";
  const usage =
    usedByStepIds.length === 0 ? "contract metadata" : `steps ${usedByStepIds.join(", ")}`;

  return `${name} is ${status} and ${requirement} for ${usage}.`;
}

function looksSecretLikeName(name: string): boolean {
  return /(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|PRIVATE_KEY|ACCESS_KEY)/.test(name);
}
