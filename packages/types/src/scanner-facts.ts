import type { EvidenceReference } from "./evidence.js";

export type ScannerFactPlaceholder = {
  readonly kind: "scanner-fact";
  readonly factKind: string;
  readonly evidence: readonly EvidenceReference[];
};
