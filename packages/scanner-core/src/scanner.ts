import { resolve } from "node:path";

import { typesPackage } from "@repo-knowledge/types";

import {
  runDetector,
  type RepositoryDetector,
  type ScanError,
  type ScanWarning
} from "./detector.js";
import type { ScannerFact } from "./facts.js";
import {
  buildFileInventory,
  createInventoryReader,
  type ScanFileInventory
} from "./file-inventory.js";

export const scannerCorePackage = {
  name: "@repo-knowledge/scanner-core",
  phase: typesPackage.phase
} as const;

export type ScanRepositoryInput = {
  readonly root: string;
  readonly detectors?: readonly RepositoryDetector[];
  readonly inventory?: ScanFileInventory;
  readonly agent_run_id?: string;
  readonly tool_call_id?: string;
};

export type ScanStats = {
  readonly detector_count: number;
  readonly detectors_succeeded: number;
  readonly detectors_failed: number;
  readonly facts_emitted: number;
  readonly warnings_emitted: number;
  readonly errors_emitted: number;
  readonly files_in_inventory: number;
};

export type RepositoryScanResult = {
  readonly schema_version: 1;
  readonly tool_name: "scan_repository";
  readonly agent_run_id?: string;
  readonly tool_call_id?: string;
  readonly repository_root: string;
  readonly scanned_at: string;
  readonly duration_ms: number;
  readonly facts: readonly ScannerFact[];
  readonly warnings: readonly ScanWarning[];
  readonly errors: readonly ScanError[];
  readonly stats: ScanStats;
};

export async function scanRepository(input: ScanRepositoryInput): Promise<RepositoryScanResult> {
  const startedAt = new Date();
  const start = Date.now();
  const detectors = [...(input.detectors ?? [])];
  const repositoryRoot = resolve(input.root);
  const inventory = input.inventory ?? (await buildFileInventory({ root: repositoryRoot }));
  const inventoryReader = createInventoryReader(inventory);
  const context = {
    repositoryRoot,
    startedAt,
    inventory,
    readFile: inventoryReader.readText,
    readFileIfSafe: inventoryReader.readTextIfSafe
  };
  const facts: ScannerFact[] = [];
  const warnings: ScanWarning[] = [...(inventory.warnings ?? [])];
  const errors: ScanError[] = [];
  let detectorsSucceeded = 0;
  let detectorsFailed = 0;

  for (const detector of detectors) {
    const detectorRun = await runDetector(detector, context);

    facts.push(...detectorRun.result.facts);
    warnings.push(...detectorRun.result.warnings);
    errors.push(...detectorRun.result.errors);

    if (detectorRun.failed) {
      detectorsFailed += 1;
    } else {
      detectorsSucceeded += 1;
    }
  }

  return {
    schema_version: 1,
    tool_name: "scan_repository",
    agent_run_id: input.agent_run_id,
    tool_call_id: input.tool_call_id,
    repository_root: context.repositoryRoot,
    scanned_at: startedAt.toISOString(),
    duration_ms: Date.now() - start,
    facts,
    warnings,
    errors,
    stats: {
      detector_count: detectors.length,
      detectors_succeeded: detectorsSucceeded,
      detectors_failed: detectorsFailed,
      facts_emitted: facts.length,
      warnings_emitted: warnings.length,
      errors_emitted: errors.length,
      files_in_inventory: context.inventory.files.length
    }
  };
}
