export type EvidenceReference = {
  readonly sourcePath: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly detector?: string;
  readonly confidence?: "low" | "medium" | "high";
};
