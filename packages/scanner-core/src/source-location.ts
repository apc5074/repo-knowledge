import {
  createScannerEvidence,
  type ScannerEvidence,
  type ScannerEvidenceKind
} from "./evidence.js";

const defaultMaxExcerptLength = 120;

export type SourceLocation = {
  readonly line_start: number;
  readonly line_end: number;
  readonly excerpt?: string;
};

export type CreateEvidenceFromLocationInput = {
  readonly kind: ScannerEvidenceKind;
  readonly sourcePath: string;
  readonly detector: string;
  readonly location?: SourceLocation;
};

export function findConfigKeyLocation(text: string, key: string): SourceLocation | undefined {
  const escapedKey = escapeRegExp(key);
  const keyPattern = new RegExp(`(^|[\\s{,])["']?${escapedKey}["']?\\s*[:=]`);

  return findRegexLocation(text, keyPattern);
}

export function findStringLocation(text: string, value: string): SourceLocation | undefined {
  if (value.length === 0) {
    return undefined;
  }

  const lineNumber = splitLines(text).findIndex((line) => line.includes(value));

  if (lineNumber === -1) {
    return undefined;
  }

  return locationForLine(text, lineNumber);
}

export function findRegexLocation(text: string, pattern: RegExp): SourceLocation | undefined {
  const lines = splitLines(text);
  const matcher = new RegExp(pattern.source, pattern.flags.replaceAll("g", ""));
  const lineNumber = lines.findIndex((line) => matcher.test(line));

  if (lineNumber === -1) {
    return undefined;
  }

  return {
    line_start: lineNumber + 1,
    line_end: lineNumber + 1,
    excerpt: createSafeExcerpt(lines[lineNumber] ?? "")
  };
}

export function createSafeExcerpt(
  text: string,
  maxLength = defaultMaxExcerptLength
): string | undefined {
  const normalized = text.trim().replace(/\s+/g, " ");

  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function createEvidenceFromLocation(
  input: CreateEvidenceFromLocationInput
): ScannerEvidence {
  return createScannerEvidence({
    kind: input.kind,
    sourcePath: input.sourcePath,
    detector: input.detector,
    lineStart: input.location?.line_start,
    lineEnd: input.location?.line_end,
    excerpt: input.location?.excerpt
  });
}

function locationForLine(text: string, zeroBasedLineNumber: number): SourceLocation {
  const line = splitLines(text)[zeroBasedLineNumber] ?? "";

  return {
    line_start: zeroBasedLineNumber + 1,
    line_end: zeroBasedLineNumber + 1,
    excerpt: createSafeExcerpt(line)
  };
}

function splitLines(text: string): readonly string[] {
  return text.split(/\r?\n/);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
