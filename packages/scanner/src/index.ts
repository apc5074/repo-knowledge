import { typesPackage, type ScannerFactPlaceholder } from "@repo-knowledge/types";

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
  readonly facts: readonly ScannerFactPlaceholder[];
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
