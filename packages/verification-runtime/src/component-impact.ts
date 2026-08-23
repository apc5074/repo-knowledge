import type { RepositoryContract } from "../../repository-contract/src/index.js";

import { matchesPathPattern } from "./path-patterns.js";

export type VerificationComponentImpact = {
  readonly knownComponentIds: readonly string[];
  readonly impactedComponentIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly matchedCheckIds: readonly string[];
  readonly reasons: readonly string[];
};

export type ResolveVerificationComponentImpactInput = {
  readonly contract: RepositoryContract;
  readonly changedPaths: readonly string[];
  readonly explicitComponentIds?: readonly string[];
};

export function resolveVerificationComponentImpact(
  input: ResolveVerificationComponentImpactInput
): VerificationComponentImpact {
  const knownComponentIds = collectKnownComponentIds(input.contract);
  const impacted = new Set<string>();
  const reasons: string[] = [];
  const matchedRuleIds: string[] = [];
  const matchedCheckIds: string[] = [];

  for (const explicit of input.explicitComponentIds ?? []) {
    if (!knownComponentIds.includes(explicit)) {
      continue;
    }

    impacted.add(explicit);
    reasons.push(`selected because component ${explicit} was requested`);
  }

  for (const rule of input.contract.verification?.rules ?? []) {
    if (matchesAnyPath(rule.paths ?? [], input.changedPaths)) {
      matchedRuleIds.push(rule.id);
      for (const componentId of rule.components ?? []) {
        impacted.add(componentId);
        reasons.push(`selected because changed paths matched verification rule ${rule.id}`);
      }
      for (const check of rule.checks ?? []) {
        for (const componentId of check.components ?? []) {
          impacted.add(componentId);
          matchedCheckIds.push(check.id);
        }
      }
    }
  }

  for (const [componentId] of Object.entries(input.contract.applications ?? {})) {
    if (input.changedPaths.some((path) => path.startsWith(`apps/${componentId}`))) {
      impacted.add(componentId);
    }
  }

  for (const componentId of Object.keys(input.contract.services ?? {})) {
    if (input.changedPaths.some((path) => path.includes(componentId))) {
      impacted.add(componentId);
    }
  }

  return {
    knownComponentIds,
    impactedComponentIds: [...impacted].sort(),
    matchedRuleIds,
    matchedCheckIds,
    reasons
  };
}

function collectKnownComponentIds(contract: RepositoryContract): readonly string[] {
  const ids = new Set<string>();

  for (const id of Object.keys(contract.applications ?? {})) {
    ids.add(id);
  }

  for (const id of Object.keys(contract.services ?? {})) {
    ids.add(id);
  }

  for (const rule of contract.verification?.rules ?? []) {
    for (const componentId of rule.components ?? []) {
      ids.add(componentId);
    }
    for (const check of rule.checks ?? []) {
      for (const componentId of check.components ?? []) {
        ids.add(componentId);
      }
    }
  }

  return [...ids].sort();
}

function matchesAnyPath(patterns: readonly string[], paths: readonly string[]): boolean {
  return patterns.some((pattern) => paths.some((path) => matchesPathPattern(pattern, path)));
}
