import type { RepositoryContract } from "../../repository-contract/src/index.js";

import type { SelectedVerificationCheck, VerificationCheck } from "./types.js";

export type VerificationEnvironmentVariableResult = {
  readonly name: string;
  readonly status: "present" | "missing";
  readonly required: boolean;
  readonly secret: boolean;
  readonly usedByCheckIds: readonly string[];
  readonly summary: string;
};

export type VerificationEnvironmentResolution = {
  readonly variables: readonly VerificationEnvironmentVariableResult[];
  readonly values: Readonly<Record<string, string>>;
  readonly missingRequiredNames: readonly string[];
  readonly missingOptionalNames: readonly string[];
  readonly blockedCheckIds: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

export type VerificationEnvironmentResolutionInput = {
  readonly contract: RepositoryContract;
  readonly checks: readonly (VerificationCheck | SelectedVerificationCheck)[];
  readonly env?: Readonly<Record<string, string | undefined>>;
};

export function resolveVerificationEnvironment(
  input: VerificationEnvironmentResolutionInput
): VerificationEnvironmentResolution {
  const sourceEnvironment = input.env ?? process.env;
  const usages = collectEnvironmentUsages(input.contract, input.checks);
  const variables = [...usages.keys()].sort().map((name) => {
    const usage = usages.get(name);
    const value = sourceEnvironment[name];
    const status = value === undefined || value === "" ? "missing" : "present";
    const required = (usage?.requiredByCheckIds.size ?? 0) > 0;
    const usedByCheckIds = [...(usage?.checkIds ?? new Set<string>())].sort();

    return {
      name,
      status,
      required,
      secret: looksSecretLikeName(name),
      usedByCheckIds,
      summary: summarizeEnvironmentVariable(name, status, required, usedByCheckIds)
    } satisfies VerificationEnvironmentVariableResult;
  });

  const missingRequiredNames = variables
    .filter((variable) => variable.required && variable.status === "missing")
    .map((variable) => variable.name);
  const missingOptionalNames = variables
    .filter((variable) => !variable.required && variable.status === "missing")
    .map((variable) => variable.name);
  const blockedCheckIds = [
    ...new Set(
      missingRequiredNames.flatMap((name) => [...(usages.get(name)?.requiredByCheckIds ?? [])])
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
    blockedCheckIds,
    warnings: missingOptionalNames.map(
      (name) => `${name} is optional for verification and is not set.`
    ),
    errors: missingRequiredNames.map(
      (name) => `${name} is required for verification and is not set.`
    )
  };
}

function collectEnvironmentUsages(
  contract: RepositoryContract,
  checks: readonly (VerificationCheck | SelectedVerificationCheck)[]
): Map<
  string,
  {
    readonly checkIds: Set<string>;
    readonly requiredByCheckIds: Set<string>;
  }
> {
  const usages = new Map<
    string,
    {
      readonly checkIds: Set<string>;
      readonly requiredByCheckIds: Set<string>;
    }
  >();

  for (const name of Object.keys(contract.environment ?? {})) {
    addUsage(usages, name);
  }

  for (const check of checks) {
    for (const name of check.command.environment ?? []) {
      addUsage(usages, name, check.id, check.command.optional !== true);
    }
  }

  return usages;
}

function addUsage(
  usages: Map<string, { readonly checkIds: Set<string>; readonly requiredByCheckIds: Set<string> }>,
  name: string,
  checkId?: string,
  requiredByCheck = false
): void {
  const usage = usages.get(name) ?? {
    checkIds: new Set<string>(),
    requiredByCheckIds: new Set<string>()
  };

  if (checkId !== undefined) {
    usage.checkIds.add(checkId);

    if (requiredByCheck) {
      usage.requiredByCheckIds.add(checkId);
    }
  }

  usages.set(name, usage);
}

function summarizeEnvironmentVariable(
  name: string,
  status: VerificationEnvironmentVariableResult["status"],
  required: boolean,
  usedByCheckIds: readonly string[]
): string {
  const requirement = required ? "required" : "optional";
  const usage =
    usedByCheckIds.length === 0 ? "contract metadata" : `checks ${usedByCheckIds.join(", ")}`;

  return `${name} is ${status} and ${requirement} for ${usage}.`;
}

function looksSecretLikeName(name: string): boolean {
  return /(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|PRIVATE_KEY|ACCESS_KEY)/.test(name);
}
