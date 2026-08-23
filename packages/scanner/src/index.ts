import {
  createDefaultRepositoryDetectors,
  scanRepository as scanRepositoryCore,
  type RepositoryDetector,
  type RepositoryScanResult,
  type ScanFileInventory,
  type ScanRepositoryInput,
  type ScanStats,
  type ScanWarning,
  type ScanError
} from "@repo-knowledge/scanner-core";

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
export { createDefaultRepositoryDetectors };
export type {
  RepositoryDetector,
  RepositoryScanResult,
  ScanError,
  ScanFileInventory,
  ScanStats,
  ScanWarning
};

export const scannerPackage = {
  name: "@repo-knowledge/scanner",
  phase: "phase-3-repository-scanning",
  status: "implemented"
} as const;

export type ScannerInput = Omit<ScanRepositoryInput, "detectors"> & {
  readonly detectors?: ScanRepositoryInput["detectors"];
};

export type ScannerResult = RepositoryScanResult;

export function scanRepository(input: ScannerInput): Promise<ScannerResult> {
  return scanRepositoryCore({
    ...input,
    detectors: input.detectors ?? createDefaultRepositoryDetectors()
  });
}
