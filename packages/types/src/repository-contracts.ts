import type { EvidenceReference } from "./evidence.js";

export type RepositoryContractPlaceholder = {
  readonly kind: "repository-contract";
  readonly schemaVersion: "phase-1-pending";
  readonly evidence?: readonly EvidenceReference[];
};
