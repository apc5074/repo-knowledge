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
    const result = normalizeDetectorResult(await detector.run(context));
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
          {
            detector: detector.name,
            message: error instanceof Error ? error.message : String(error),
            recoverable: true
          }
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

export function normalizeDetectorResult(result: DetectorResult): Required<DetectorResult> {
  return {
    facts: result.facts ?? [],
    warnings: result.warnings ?? [],
    errors: result.errors ?? [],
    stats: result.stats ?? {}
  };
}
