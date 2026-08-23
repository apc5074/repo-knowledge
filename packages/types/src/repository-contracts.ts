import type { EvidenceReference } from "./evidence.js";

export type RepositoryContractRecord = {
  readonly kind: "repository-contract";
  readonly schemaVersion: "1";
  readonly evidence?: readonly EvidenceReference[];
};
