import type { Verification, VerificationCheck } from "@repo-knowledge/repository-contract";
import type { ScannerFact } from "@repo-knowledge/scanner-core";

import { commandFacts, commandStep, dedupeCommands, type CommandFactRecord } from "./commands.js";
import type { InitReviewItem } from "./result.js";

export type VerificationMappingResult = {
  readonly verification: Verification;
  readonly reviewItems: readonly InitReviewItem[];
  readonly inferredFields: readonly string[];
};

const validationCategories = ["typecheck", "lint", "test", "build"] as const;

export function mapScannerFactsToVerification(
  facts: readonly ScannerFact[]
): VerificationMappingResult {
  const reviewItems: InitReviewItem[] = [];
  const records = dedupeCommands(commandFacts(facts)).filter((record) =>
    validationCategories.includes(record.category as (typeof validationCategories)[number])
  );
  const checks = selectedChecks(records, reviewItems);
  const verification: Verification = checks.length > 0 ? { default: checks } : {};

  return {
    verification,
    reviewItems,
    inferredFields: checks.length > 0 ? ["verification.default"] : []
  };
}

function selectedChecks(
  records: readonly CommandFactRecord[],
  reviewItems: InitReviewItem[]
): VerificationCheck[] {
  const byKind = new Map<string, CommandFactRecord[]>();

  for (const record of records) {
    if (!record.category) {
      continue;
    }

    byKind.set(record.category, [...(byKind.get(record.category) ?? []), record]);
  }

  const checks: VerificationCheck[] = [];

  for (const category of validationCategories) {
    const candidates = byKind.get(category) ?? [];
    const best = candidates[0];

    if (!best) {
      continue;
    }

    checks.push({
      id: category === "test" ? "unit-test" : category,
      kind: category === "test" ? "test" : category,
      command: commandStep(best, category === "test" ? "unit-test" : category),
      evidence: [
        ...best.fact.evidence.map((evidence) => ({
          kind: evidence.kind,
          source_path: evidence.source_path,
          line_start: evidence.line_start,
          line_end: evidence.line_end,
          detector: evidence.detector ?? best.fact.detector,
          confidence: best.fact.confidence,
          notes: evidence.excerpt
        }))
      ]
    });

    for (const alternative of candidates.slice(1)) {
      reviewItems.push({
        id: `verification-${category}-${alternative.cwd.replace(/[^A-Za-z0-9_-]+/g, "-")}`,
        kind: "confirmation-required",
        title: "Alternative verification command needs review",
        summary: `Alternative ${category} command was detected but not selected: ${alternative.command}`,
        evidence: alternative.fact.evidence.map((evidence) => evidence.source_path)
      });
    }
  }

  return checks;
}
