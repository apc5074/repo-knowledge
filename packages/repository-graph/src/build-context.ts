import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import {
  createJsonDoctorStateStore,
  resolveDoctorStateStorePaths
} from "@repo-knowledge/doctor-runtime";
import {
  parseRepositoryContractFile,
  type RepositoryContract
} from "@repo-knowledge/repository-contract";
import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  scanRepository,
  type RepositoryScanResult,
  type ScanFileInventory
} from "@repo-knowledge/scanner-core";
import {
  createJsonVerificationHistoryStore,
  resolveVerificationHistoryStorePaths,
  type VerificationHistory
} from "@repo-knowledge/verification-runtime";

const execFileAsync = promisify(execFile);
const defaultContractRelativePath = ".board/repository.yaml";

export type GraphBuildContext = {
  readonly repositoryRoot: string;
  readonly repositoryStateRoot: string;
  readonly contractPath?: string;
  readonly contract?: RepositoryContract;
  readonly scannerResult: RepositoryScanResult;
  readonly verificationHistory: VerificationHistory;
  readonly knownProblems: readonly import("@repo-knowledge/doctor-runtime").KnownProblemRecord[];
  readonly legacyCandidates: readonly import("@repo-knowledge/doctor-runtime").LegacyCandidateRecord[];
  readonly inventory: ScanFileInventory;
  readonly commitSha?: string;
  readonly sourceFingerprints: Readonly<Record<string, string>>;
  readonly warnings: readonly string[];
};

export type LoadGraphBuildContextInput = {
  readonly repositoryRoot: string;
  readonly repositoryStateRoot?: string;
  readonly contractPath?: string;
  readonly scannerResult?: RepositoryScanResult;
  readonly inventory?: ScanFileInventory;
  readonly loadContract?: (path: string) => Promise<RepositoryContract>;
  readonly scan?: (root: string, inventory: ScanFileInventory) => Promise<RepositoryScanResult>;
  readonly getCommitSha?: (root: string) => Promise<string | undefined>;
  readonly fingerprintFiles?: (
    root: string,
    inventory: ScanFileInventory
  ) => Promise<Readonly<Record<string, string>>>;
};

export async function loadGraphBuildContext(
  input: LoadGraphBuildContextInput
): Promise<GraphBuildContext> {
  const repositoryRoot = resolve(input.repositoryRoot);
  const repositoryStateRoot = resolve(
    input.repositoryStateRoot ?? join(repositoryRoot, ".board/state")
  );
  const warnings: string[] = [];
  const inventory = input.inventory ?? (await buildFileInventory({ root: repositoryRoot }));
  const candidateContractPath = resolve(
    input.contractPath ?? join(repositoryRoot, defaultContractRelativePath)
  );
  const contract = await loadOptionalContract(candidateContractPath, input.loadContract, warnings);
  const scannerResult =
    input.scannerResult ?? (await (input.scan ?? defaultScan)(repositoryRoot, inventory));
  const [commitSha, sourceFingerprints, verificationHistory, doctorState] = await Promise.all([
    (input.getCommitSha ?? readCommitSha)(repositoryRoot),
    (input.fingerprintFiles ?? fingerprintInventoryFiles)(repositoryRoot, inventory),
    loadVerificationHistory(repositoryStateRoot, warnings),
    loadDoctorState(repositoryStateRoot, warnings)
  ]);

  return {
    repositoryRoot,
    repositoryStateRoot,
    contractPath:
      contract === undefined ? undefined : relative(repositoryRoot, candidateContractPath),
    contract,
    scannerResult,
    verificationHistory,
    knownProblems: doctorState.knownProblems,
    legacyCandidates: doctorState.legacyCandidates,
    inventory,
    commitSha,
    sourceFingerprints,
    warnings: [...warnings, ...scannerResult.warnings.map((warning) => warning.message)]
  };
}

async function loadOptionalContract(
  path: string,
  loadContract: LoadGraphBuildContextInput["loadContract"],
  warnings: string[]
): Promise<RepositoryContract | undefined> {
  try {
    await access(path);
  } catch {
    return undefined;
  }

  try {
    return await (loadContract ?? parseRepositoryContractFile)(path);
  } catch (error) {
    warnings.push(`Could not load repository contract: ${toMessage(error)}`);
    return undefined;
  }
}

async function defaultScan(
  root: string,
  inventory: ScanFileInventory
): Promise<RepositoryScanResult> {
  return scanRepository({ root, inventory, detectors: createDefaultRepositoryDetectors() });
}

async function readCommitSha(root: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8"
    });
    return String(stdout).trim() || undefined;
  } catch {
    return undefined;
  }
}

async function fingerprintInventoryFiles(
  root: string,
  inventory: ScanFileInventory
): Promise<Readonly<Record<string, string>>> {
  const paths = inventory.entries?.map((entry) => entry.path) ?? inventory.files;
  const fingerprints = await Promise.all(
    paths.map(async (path) => {
      const content = await readFile(join(root, path)).catch(() => undefined);
      return [
        path,
        createHash("sha256")
          .update(content ?? path)
          .digest("hex")
      ] as const;
    })
  );
  return Object.fromEntries(fingerprints);
}

async function loadVerificationHistory(
  repositoryStateRoot: string,
  warnings: string[]
): Promise<VerificationHistory> {
  try {
    return await createJsonVerificationHistoryStore(
      resolveVerificationHistoryStorePaths({ repositoryStateRoot })
    ).readHistory();
  } catch (error) {
    warnings.push(`Could not load verification history: ${toMessage(error)}`);
    return { schemaVersion: 1, runs: [] };
  }
}

async function loadDoctorState(
  repositoryStateRoot: string,
  warnings: string[]
): Promise<{
  readonly knownProblems: readonly import("@repo-knowledge/doctor-runtime").KnownProblemRecord[];
  readonly legacyCandidates: readonly import("@repo-knowledge/doctor-runtime").LegacyCandidateRecord[];
}> {
  try {
    const store = createJsonDoctorStateStore(resolveDoctorStateStorePaths({ repositoryStateRoot }));
    const [knownProblems, legacyCandidates] = await Promise.all([
      store.readKnownProblems(),
      store.readLegacyCandidates()
    ]);
    warnings.push(...knownProblems.warnings.map((warning) => warning.message));
    warnings.push(...legacyCandidates.warnings.map((warning) => warning.message));
    return {
      knownProblems: knownProblems.value.problems,
      legacyCandidates: legacyCandidates.value.candidates
    };
  } catch (error) {
    warnings.push(`Could not load doctor state: ${toMessage(error)}`);
    return { knownProblems: [], legacyCandidates: [] };
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
