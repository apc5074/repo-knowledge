import type { EvidenceReference } from "./evidence.js";

export type CheckResultPlaceholder = {
  readonly kind: "check-result";
  readonly name: string;
  readonly status: "passed" | "failed" | "skipped" | "pending";
  readonly evidence?: readonly EvidenceReference[];
};
