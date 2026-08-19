import type { ScannerFact, ScannerFactKind } from "./facts.js";
import type { InventoryReader, ScanFileInventory } from "./file-inventory.js";

export type DetectorPrerequisite = {
  readonly kind: "file" | "directory" | "fact";
  readonly value: string;
};

export type ScanWarning = {
  readonly detector?: string;
  readonly message: string;
  readonly path?: string;
};

export type ScanError = {
  readonly detector?: string;
  readonly message: string;
  readonly path?: string;
  readonly recoverable: boolean;
  readonly details?: unknown;
};

export type DetectorStats = {
  readonly files_considered?: number;
  readonly files_read?: number;
  readonly facts_emitted?: number;
  readonly duration_ms?: number;
};

export type DetectorResult = {
  readonly facts?: readonly ScannerFact[];
  readonly warnings?: readonly ScanWarning[];
  readonly errors?: readonly ScanError[];
  readonly stats?: DetectorStats;
};

export type ScanContext = {
  readonly repositoryRoot: string;
  readonly startedAt: Date;
  readonly inventory: ScanFileInventory;
  readonly facts: readonly ScannerFact[];
  readonly readFile: InventoryReader["readText"];
  readonly readFileIfSafe: InventoryReader["readTextIfSafe"];
};

export type RepositoryDetector = {
  readonly name: string;
  readonly version: string;
  readonly emittedFactKinds: readonly ScannerFactKind[];
  readonly filePatterns?: readonly string[];
  readonly prerequisites?: readonly DetectorPrerequisite[];
  readonly run: (context: ScanContext) => DetectorResult | Promise<DetectorResult>;
};

export type DetectorRunResult = {
  readonly detector: RepositoryDetector;
  readonly result: Required<DetectorResult>;
  readonly duration_ms: number;
  readonly failed: boolean;
};

export async function runDetector(
  detector: RepositoryDetector,
  context: ScanContext
): Promise<DetectorRunResult> {
  const start = Date.now();

  try {
    const result = normalizeDetectorResult(await detector.run(context), detector.name);
    const duration = Date.now() - start;

    return {
      detector,
      result: {
        ...result,
        stats: {
          ...result.stats,
          duration_ms: result.stats.duration_ms ?? duration
        }
      },
      duration_ms: duration,
      failed: false
    };
  } catch (error) {
    const duration = Date.now() - start;

    return {
      detector,
      result: {
        facts: [],
        warnings: [],
        errors: [
          normalizeScanError(error, {
            detector: detector.name,
            recoverable: true
          })
        ],
        stats: {
          duration_ms: duration
        }
      },
      duration_ms: duration,
      failed: true
    };
  }
}

export function normalizeDetectorResult(
  result: DetectorResult,
  detector?: string
): Required<DetectorResult> {
  return {
    facts: result.facts ?? [],
    warnings: (result.warnings ?? []).map((warning) => normalizeScanWarning(warning, detector)),
    errors: (result.errors ?? []).map((error) => normalizeScanError(error, { detector })),
    stats: result.stats ?? {}
  };
}

export function normalizeScanWarning(warning: ScanWarning, detector?: string): ScanWarning {
  return {
    ...((warning.detector ?? detector) ? { detector: warning.detector ?? detector } : {}),
    ...(warning.path ? { path: warning.path } : {}),
    message: warning.message
  };
}

export function normalizeScanError(
  error: unknown,
  defaults: {
    readonly detector?: string;
    readonly path?: string;
    readonly recoverable?: boolean;
  } = {}
): ScanError {
  if (isScanError(error)) {
    return {
      ...((error.detector ?? defaults.detector)
        ? { detector: error.detector ?? defaults.detector }
        : {}),
      ...((error.path ?? defaults.path) ? { path: error.path ?? defaults.path } : {}),
      message: error.message,
      recoverable: error.recoverable,
      ...(error.details !== undefined ? { details: error.details } : {})
    };
  }

  return {
    ...(defaults.detector ? { detector: defaults.detector } : {}),
    ...(defaults.path ? { path: defaults.path } : {}),
    message: error instanceof Error ? error.message : String(error),
    recoverable: defaults.recoverable ?? true
  };
}

function isScanError(error: unknown): error is ScanError {
  return (
    error !== null && typeof error === "object" && "message" in error && "recoverable" in error
  );
}
