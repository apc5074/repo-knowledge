import { isAbsolute, normalize, sep } from "node:path";

import type { EvidenceReference } from "@repo-knowledge/types";

export const scannerConfidenceLevels = ["high", "medium", "low"] as const;

export type ScannerConfidence = (typeof scannerConfidenceLevels)[number];

export const scannerEvidenceKinds = ["source", "config", "test", "documentation"] as const;

export type ScannerEvidenceKind = (typeof scannerEvidenceKinds)[number];

export type ScannerEvidence = {
  readonly kind: ScannerEvidenceKind;
  readonly source_path: string;
  readonly line_start?: number;
  readonly line_end?: number;
  readonly excerpt?: string;
  readonly detector: string;
};

export type CreateScannerEvidenceInput = {
  readonly kind: ScannerEvidenceKind;
  readonly sourcePath: string;
  readonly detector: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly excerpt?: string;
};

const maxEvidenceExcerptLength = 240;

export function createScannerEvidence(input: CreateScannerEvidenceInput): ScannerEvidence {
  const sourcePath = normalizeRepositoryRelativePath(input.sourcePath);
  const lineStart = normalizeOptionalLine(input.lineStart, "lineStart");
  const lineEnd = normalizeOptionalLine(input.lineEnd, "lineEnd");

  if (lineStart !== undefined && lineEnd !== undefined && lineEnd < lineStart) {
    throw new Error("Evidence lineEnd must be greater than or equal to lineStart.");
  }

  if (input.detector.trim().length === 0) {
    throw new Error("Evidence detector is required.");
  }

  return {
    kind: input.kind,
    source_path: sourcePath,
    line_start: lineStart,
    line_end: lineEnd,
    excerpt: normalizeExcerpt(input.excerpt),
    detector: input.detector
  };
}

export function toContractEvidenceReference(
  evidence: ScannerEvidence,
  confidence?: ScannerConfidence
): EvidenceReference {
  return {
    sourcePath: evidence.source_path,
    lineStart: evidence.line_start,
    lineEnd: evidence.line_end,
    detector: evidence.detector,
    confidence
  };
}

export function normalizeRepositoryRelativePath(path: string): string {
  const trimmed = path.trim();

  if (trimmed.length === 0) {
    throw new Error("Evidence source path is required.");
  }

  if (isAbsolute(trimmed)) {
    throw new Error("Evidence source path must be repository-relative.");
  }

  const normalized = normalize(trimmed).split(sep).join("/");

  if (normalized === "." || normalized.startsWith("../") || normalized === "..") {
    throw new Error("Evidence source path must stay inside the repository.");
  }

  return normalized;
}

export function isScannerConfidence(value: string): value is ScannerConfidence {
  return scannerConfidenceLevels.includes(value as ScannerConfidence);
}

export function confidenceRank(confidence: ScannerConfidence): number {
  if (confidence === "high") {
    return 3;
  }

  if (confidence === "medium") {
    return 2;
  }

  return 1;
}

function normalizeOptionalLine(value: number | undefined, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Evidence ${name} must be a positive integer.`);
  }

  return value;
}

function normalizeExcerpt(excerpt: string | undefined): string | undefined {
  if (excerpt === undefined) {
    return undefined;
  }

  const normalized = excerpt.trim().replace(/\s+/g, " ");

  if (normalized.length <= maxEvidenceExcerptLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxEvidenceExcerptLength - 3)}...`;
}
