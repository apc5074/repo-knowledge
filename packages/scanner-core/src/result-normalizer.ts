import type { ScannerEvidence } from "./evidence.js";
import type { ScannerFact } from "./facts.js";
import type { RepositoryScanResult } from "./scanner.js";

export const stableTestTimestamp = "2000-01-01T00:00:00.000Z";

export type NormalizeScanResultOptions = {
  readonly testMode?: boolean;
  readonly scannedAt?: string;
  readonly durationMs?: number;
};

export function normalizeScanResult(
  result: RepositoryScanResult,
  options: NormalizeScanResultOptions = {}
): RepositoryScanResult {
  const scannedAt =
    options.scannedAt ?? (options.testMode ? stableTestTimestamp : result.scanned_at);

  return {
    ...result,
    repository_root: normalizePath(result.repository_root),
    scanned_at: scannedAt,
    duration_ms: options.durationMs ?? (options.testMode ? 0 : result.duration_ms),
    facts: [...result.facts].map(normalizeFact).sort(compareFacts),
    warnings: [...result.warnings].map(normalizeWarning).sort(compareWarnings),
    errors: [...result.errors].map(normalizeError).sort(compareErrors)
  };
}

export function normalizeFact(fact: ScannerFact): ScannerFact {
  const value = normalizeValue(fact.value);
  const evidence = [...fact.evidence].map(normalizeEvidence).sort(compareEvidence);

  return {
    ...fact,
    id: stableFactId({
      ...fact,
      value,
      evidence
    }),
    value,
    evidence
  };
}

export function stableFactId(fact: Omit<ScannerFact, "id">): string {
  return createStableHash({
    kind: fact.kind,
    value: fact.value,
    confidence: fact.confidence,
    source: fact.source,
    detector: fact.detector,
    evidence: fact.evidence
  });
}

function normalizeEvidence(evidence: ScannerEvidence): ScannerEvidence {
  return {
    ...evidence,
    source_path: normalizePath(evidence.source_path)
  };
}

function normalizeWarning(warning: RepositoryScanResult["warnings"][number]) {
  return {
    ...warning,
    ...(warning.path ? { path: normalizePath(warning.path) } : {})
  };
}

function normalizeError(error: RepositoryScanResult["errors"][number]) {
  return {
    ...error,
    ...(error.path ? { path: normalizePath(error.path) } : {})
  };
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        isPathKey(key) && typeof item === "string" ? normalizePath(item) : normalizeValue(item)
      ])
    );
  }

  return value;
}

function isPathKey(key: string): boolean {
  return /(^|_)(path|cwd|sourcePath|source_path|repository_root)$/i.test(key);
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+/g, "/");
}

function compareFacts(left: ScannerFact, right: ScannerFact): number {
  return (
    left.kind.localeCompare(right.kind) ||
    left.detector.localeCompare(right.detector) ||
    left.id.localeCompare(right.id)
  );
}

function compareEvidence(left: ScannerEvidence, right: ScannerEvidence): number {
  return (
    left.source_path.localeCompare(right.source_path) ||
    (left.line_start ?? 0) - (right.line_start ?? 0) ||
    (left.line_end ?? 0) - (right.line_end ?? 0) ||
    left.detector.localeCompare(right.detector) ||
    left.kind.localeCompare(right.kind)
  );
}

function compareWarnings(
  left: RepositoryScanResult["warnings"][number],
  right: RepositoryScanResult["warnings"][number]
): number {
  return (
    (left.path ?? "").localeCompare(right.path ?? "") ||
    (left.detector ?? "").localeCompare(right.detector ?? "") ||
    left.message.localeCompare(right.message)
  );
}

function compareErrors(
  left: RepositoryScanResult["errors"][number],
  right: RepositoryScanResult["errors"][number]
): number {
  return (
    (left.path ?? "").localeCompare(right.path ?? "") ||
    (left.detector ?? "").localeCompare(right.detector ?? "") ||
    left.message.localeCompare(right.message)
  );
}

function createStableHash(value: unknown): string {
  const serialized = JSON.stringify(sortKeys(value));
  let hash = 0x811c9dc5;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortKeys(item)])
    );
  }

  return value;
}
