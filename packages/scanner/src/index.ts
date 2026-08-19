import { typesPackage } from "@repo-knowledge/types";

export {
  confidenceRank,
  createScannerEvidence,
  isScannerConfidence,
  normalizeRepositoryRelativePath,
  scannerConfidenceLevels,
  scannerEvidenceKinds,
  toContractEvidenceReference
} from "./evidence.js";
export type {
  CreateScannerEvidenceInput,
  ScannerConfidence,
  ScannerEvidence,
  ScannerEvidenceKind
} from "./evidence.js";
export {
  createScannerFact,
  getScannerFactDefinition,
  isScannerFactKind,
  scannerFactDefinitions,
  scannerFactKinds
} from "./facts.js";
export type {
  CreateScannerFactInput,
  FutureMaintenanceAgent,
  ScannerFact,
  ScannerFactDefinition,
  ScannerFactKind,
  ScannerFactSource
} from "./facts.js";
import type { ScannerFact } from "./facts.js";

export const scannerPackage = {
  name: "@repo-knowledge/scanner",
  phase: typesPackage.phase
} as const;

export type ScannerInput = {
  readonly repositoryRoot: string;
};

export type ScannerResult = {
  readonly schemaVersion: "phase-0-placeholder";
  readonly scannerVersion: "0.0.0";
  readonly repositoryRoot: string;
  readonly facts: readonly ScannerFact[];
  readonly warnings: readonly string[];
};

export function scanRepository(input: ScannerInput): ScannerResult {
  return {
    schemaVersion: "phase-0-placeholder",
    scannerVersion: "0.0.0",
    repositoryRoot: input.repositoryRoot,
    facts: [],
    warnings: [
      "Phase 0 scanner placeholder: deterministic repository detectors are implemented in Phase 3."
    ]
  };
}
