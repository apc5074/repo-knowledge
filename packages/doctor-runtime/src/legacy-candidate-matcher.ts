import type { ScannerFact } from "@repo-knowledge/scanner-core";

import { stableLegacyCandidateId, type LegacyCandidateStore } from "./legacy-candidate-store.js";
import type { DiagnosticEvidence, LegacyCandidateRecord } from "./types.js";

export type ImportLegacyCandidatesInput = {
  readonly facts?: readonly ScannerFact[];
  readonly store?: LegacyCandidateStore;
  readonly detectedAt?: string;
  readonly commitSha?: string;
  readonly inputFingerprint?: string;
};

export type ImportLegacyCandidatesResult = {
  readonly candidates: readonly LegacyCandidateRecord[];
  readonly warnings: readonly string[];
};

const legacyCandidateKinds = new Set([
  "legacy.marker_detected",
  "legacy.path_candidate_detected",
  "legacy.symbol_candidate_detected",
  "legacy.command_candidate_detected",
  "legacy.route_candidate_detected"
]);

export async function importLegacyCandidatesFromScannerFacts(
  input: ImportLegacyCandidatesInput
): Promise<ImportLegacyCandidatesResult> {
  const facts = input.facts ?? [];

  if (facts.length === 0) {
    return {
      candidates: [],
      warnings: ["No scanner legacy facts were available."]
    };
  }

  const replacementHints = replacementHintsByTarget(facts);
  const candidates = facts
    .filter((fact) => legacyCandidateKinds.has(fact.kind))
    .map((fact) => candidateFromFact(fact, replacementHints.get(targetValue(fact)) ?? [], input));
  const stored =
    input.store === undefined
      ? candidates
      : await Promise.all(candidates.map((candidate) => input.store?.upsert(candidate)));

  return {
    candidates: stored.filter(
      (candidate): candidate is LegacyCandidateRecord => candidate !== undefined
    ),
    warnings: []
  };
}

function candidateFromFact(
  fact: ScannerFact,
  replacementHints: readonly string[],
  input: ImportLegacyCandidatesInput
): LegacyCandidateRecord {
  const target = candidateTarget(fact);
  const detectedAt = input.detectedAt ?? new Date().toISOString();

  return {
    id: stableLegacyCandidateId(target),
    target,
    signalTypes: [fact.kind],
    confidence: scannerConfidenceToDiagnostic(fact.confidence),
    status: "unreviewed",
    detectedAt,
    updatedAt: detectedAt,
    evidence: fact.evidence.map((evidence) => ({
      kind: evidence.kind === "documentation" ? "file" : "scanner_fact",
      summary: `${fact.kind} from ${evidence.source_path}`,
      path: evidence.source_path,
      line: evidence.line_start,
      metadata: {
        factId: fact.id,
        detector: fact.detector,
        confidence: fact.confidence
      }
    })) satisfies readonly DiagnosticEvidence[],
    counterEvidence: counterEvidenceForFact(fact),
    replacementHints,
    suggestedReviewAction: "Review this candidate before changing or removing source.",
    scannerFactIds: [fact.id],
    commitSha: input.commitSha,
    inputFingerprint: input.inputFingerprint
  };
}

function candidateTarget(fact: ScannerFact): LegacyCandidateRecord["target"] {
  const value = fact.value as Record<string, unknown>;

  if (fact.kind === "legacy.symbol_candidate_detected") {
    return {
      kind: "symbol",
      value: stringValue(value.symbol) ?? fact.id,
      path: stringValue(value.path)
    };
  }

  if (fact.kind === "legacy.command_candidate_detected") {
    return {
      kind: "command",
      value: stringValue(value.command) ?? fact.id
    };
  }

  if (fact.kind === "legacy.route_candidate_detected") {
    return {
      kind: "route",
      value: stringValue(value.path) ?? fact.id,
      path: stringValue(value.path)
    };
  }

  return {
    kind: "path",
    value: stringValue(value.target) ?? stringValue(value.path) ?? fact.id,
    path: stringValue(value.target) ?? stringValue(value.path)
  };
}

function replacementHintsByTarget(
  facts: readonly ScannerFact[]
): ReadonlyMap<string, readonly string[]> {
  const hints = new Map<string, string[]>();

  for (const fact of facts) {
    if (fact.kind !== "legacy.replacement_detected") {
      continue;
    }

    const value = fact.value as Record<string, unknown>;
    const target = stringValue(value.target);
    const replacement = stringValue(value.replacement);

    if (target === undefined || replacement === undefined) {
      continue;
    }

    hints.set(target, [...(hints.get(target) ?? []), replacement]);
  }

  return hints;
}

function targetValue(fact: ScannerFact): string {
  const target = candidateTarget(fact);
  return target.path ?? target.value;
}

function counterEvidenceForFact(fact: ScannerFact): readonly DiagnosticEvidence[] {
  const value = fact.value as Record<string, unknown>;
  const caveat = stringValue(value.caveat);

  return caveat === undefined
    ? []
    : [
        {
          kind: "scanner_fact",
          summary: caveat,
          metadata: {
            factId: fact.id
          }
        }
      ];
}

function scannerConfidenceToDiagnostic(
  confidence: ScannerFact["confidence"]
): LegacyCandidateRecord["confidence"] {
  if (confidence === "high") {
    return "high";
  }

  if (confidence === "medium") {
    return "medium";
  }

  return "low";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
