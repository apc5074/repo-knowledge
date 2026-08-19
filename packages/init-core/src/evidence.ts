import type { Evidence } from "@repo-knowledge/repository-contract";
import type { ScannerEvidence, ScannerFact } from "@repo-knowledge/scanner-core";

export function scannerFactEvidence(fact: ScannerFact): Evidence[] {
  return fact.evidence.map((evidence) => scannerEvidenceToContractEvidence(evidence, fact));
}

export function scannerEvidenceToContractEvidence(
  evidence: ScannerEvidence,
  fact: ScannerFact
): Evidence {
  return {
    kind: evidence.kind,
    source_path: evidence.source_path,
    line_start: evidence.line_start,
    line_end: evidence.line_end,
    detector: evidence.detector ?? fact.detector,
    confidence: fact.confidence,
    notes: evidence.excerpt
  };
}
