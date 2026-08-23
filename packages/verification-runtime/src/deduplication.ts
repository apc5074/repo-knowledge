import type {
  SelectedVerificationCheck,
  VerificationCheck,
  VerificationCheckSelectionReason
} from "./types.js";

export type VerificationDeduplicationResult = {
  readonly checks: readonly SelectedVerificationCheck[];
  readonly warnings: readonly string[];
};

export class VerificationCheckConflictError extends Error {
  readonly checkId: string;

  constructor(checkId: string, message: string) {
    super(message);
    this.name = "VerificationCheckConflictError";
    this.checkId = checkId;
  }
}

export function deduplicateVerificationChecks(
  checks: readonly SelectedVerificationCheck[]
): VerificationDeduplicationResult {
  const merged = new Map<string, SelectedVerificationCheck>();
  const warnings: string[] = [];

  for (const check of checks) {
    const existing = merged.get(check.id);

    if (existing === undefined) {
      merged.set(check.id, check);
      continue;
    }

    if (!areEquivalentChecks(existing, check)) {
      throw new VerificationCheckConflictError(
        check.id,
        `Verification check ${check.id} was defined more than once with different commands or metadata.`
      );
    }

    merged.set(check.id, {
      ...existing,
      reason: mergeReasons(existing.reason, check.reason)
    });
    warnings.push(`Merged duplicate verification check ${check.id}.`);
  }

  return {
    checks: [...merged.values()],
    warnings
  };
}

function areEquivalentChecks(left: VerificationCheck, right: VerificationCheck): boolean {
  return (
    left.source === right.source &&
    left.ruleId === right.ruleId &&
    left.commandId === right.commandId &&
    left.description === right.description &&
    sameCommand(left.command, right.command) &&
    sameArray(left.paths, right.paths) &&
    sameArray(left.components, right.components) &&
    sameArray(left.requires, right.requires)
  );
}

function sameCommand(
  left: VerificationCheck["command"],
  right: VerificationCheck["command"]
): boolean {
  return (
    left.command === right.command &&
    sameArray(left.args, right.args) &&
    left.cwd === right.cwd &&
    left.shell === right.shell &&
    left.timeoutSeconds === right.timeoutSeconds
  );
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function mergeReasons(
  left: VerificationCheckSelectionReason,
  right: VerificationCheckSelectionReason
): VerificationCheckSelectionReason {
  return {
    kind: left.kind,
    details: [...left.details, ...right.details]
  };
}
