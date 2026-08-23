import type { SelectedVerificationCheck } from "./types.js";

export class VerificationDependencyError extends Error {
  readonly kind: "missing" | "cycle";
  readonly checkId: string;

  constructor(kind: VerificationDependencyError["kind"], checkId: string, message: string) {
    super(message);
    this.name = "VerificationDependencyError";
    this.kind = kind;
    this.checkId = checkId;
  }
}

export type OrderVerificationChecksResult = {
  readonly checks: readonly SelectedVerificationCheck[];
  readonly warnings: readonly string[];
};

export function orderVerificationChecks(
  checks: readonly SelectedVerificationCheck[]
): OrderVerificationChecksResult {
  const byId = new Map(checks.map((check) => [check.id, check] as const));
  const ordered: SelectedVerificationCheck[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const warnings: string[] = [];

  for (const check of checks) {
    visit(check.id, byId, ordered, visiting, visited, warnings);
  }

  return { checks: ordered, warnings };
}

function visit(
  checkId: string,
  byId: ReadonlyMap<string, SelectedVerificationCheck>,
  ordered: SelectedVerificationCheck[],
  visiting: Set<string>,
  visited: Set<string>,
  warnings: string[]
): void {
  if (visited.has(checkId)) {
    return;
  }

  const check = byId.get(checkId);
  if (check === undefined) {
    throw new VerificationDependencyError(
      "missing",
      checkId,
      `Verification check ${checkId} depends on a check that was not selected.`
    );
  }

  if (visiting.has(checkId)) {
    throw new VerificationDependencyError(
      "cycle",
      checkId,
      `Verification checks contain a dependency cycle at ${checkId}.`
    );
  }

  visiting.add(checkId);

  for (const dependencyId of check.requires) {
    if (!byId.has(dependencyId)) {
      throw new VerificationDependencyError(
        "missing",
        checkId,
        `Verification check ${checkId} requires ${dependencyId}, but it was not selected.`
      );
    }

    visit(dependencyId, byId, ordered, visiting, visited, warnings);
  }

  visiting.delete(checkId);
  visited.add(checkId);
  ordered.push(check);

  if (check.requires.length > 0) {
    warnings.push(`Ordered ${check.id} after dependencies: ${check.requires.join(", ")}.`);
  }
}
