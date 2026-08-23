import type {
  SelectedVerificationCheck,
  VerificationChangeSet,
  VerificationCheck,
  VerificationCheckSelectionReason,
  VerificationSelectionMode
} from "./types.js";

export type VerificationSelectionInput = {
  readonly mode: VerificationSelectionMode;
  readonly defaultChecks?: readonly VerificationCheck[];
  readonly checks: readonly VerificationCheck[];
  readonly changeSet: VerificationChangeSet;
  readonly requestedPaths?: readonly string[];
  readonly requestedComponentIds?: readonly string[];
  readonly requestedCheckIds?: readonly string[];
  readonly noDefault?: boolean;
};

export type VerificationSelectionResult = {
  readonly selectedChecks: readonly SelectedVerificationCheck[];
  readonly skippedCheckIds: readonly string[];
  readonly warnings: readonly string[];
};

export function selectVerificationChecks(
  input: VerificationSelectionInput
): VerificationSelectionResult {
  const selected = new Map<string, SelectedVerificationCheck>();
  const warnings: string[] = [];
  const explicitChecks = new Set(input.requestedCheckIds ?? []);
  const shouldIncludeDefaults = input.noDefault !== true && input.mode !== "checks";

  if (shouldIncludeDefaults) {
    for (const check of input.defaultChecks ?? []) {
      addSelected(selected, check, { kind: "default", details: ["default verification checks"] });
    }
  }

  for (const check of input.defaultChecks ?? []) {
    if (!shouldIncludeDefaults && explicitChecks.has(check.id)) {
      addSelected(selected, check, { kind: "explicit", details: [check.id] });
    }
  }

  for (const check of input.checks) {
    const matchesPath = check.paths.some((pattern) =>
      input.changeSet.changedPaths.some(
        (path) => path === pattern || path.startsWith(pattern.replace(/\*\*?$/, ""))
      )
    );
    const matchesComponent = check.components.some((componentId) =>
      (input.requestedComponentIds ?? []).includes(componentId)
    );
    const explicitlyRequested = explicitChecks.has(check.id);
    const explicitlyPathed = (input.requestedPaths ?? []).some((path) =>
      check.paths.some(
        (pattern) => pattern === path || path.startsWith(pattern.replace(/\*\*?$/, ""))
      )
    );

    if (
      input.mode === "all" ||
      explicitlyRequested ||
      matchesPath ||
      matchesComponent ||
      explicitlyPathed
    ) {
      addSelected(
        selected,
        check,
        buildReason(check, {
          matchesPath,
          matchesComponent,
          explicitlyRequested,
          explicitlyPathed
        })
      );
    }
  }

  return {
    selectedChecks: [...selected.values()],
    skippedCheckIds: [],
    warnings
  };
}

function addSelected(
  selected: Map<string, SelectedVerificationCheck>,
  check: VerificationCheck,
  reason: VerificationCheckSelectionReason
): void {
  const existing = selected.get(check.id);
  if (existing === undefined) {
    selected.set(check.id, { ...check, selected: true, reason });
    return;
  }

  selected.set(check.id, {
    ...existing,
    reason: {
      kind: existing.reason.kind,
      details: [...existing.reason.details, ...reason.details]
    }
  });
}

function buildReason(
  check: VerificationCheck,
  input: {
    readonly matchesPath: boolean;
    readonly matchesComponent: boolean;
    readonly explicitlyRequested: boolean;
    readonly explicitlyPathed: boolean;
  }
): VerificationCheckSelectionReason {
  if (input.explicitlyRequested) {
    return { kind: "explicit", details: [check.id] };
  }

  if (input.matchesComponent) {
    return { kind: "component", details: [...check.components] };
  }

  if (input.matchesPath || input.explicitlyPathed) {
    return { kind: "path", details: [...check.paths] };
  }

  return { kind: "rule", details: [check.id] };
}
