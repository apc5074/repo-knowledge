import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import type {
  DoctorRun,
  KnownProblemRecord,
  LegacyCandidateRecord,
  VerifiedResolutionRecord
} from "./types.js";

const defaultMaxRecentRuns = 50;
const defaultMaxKnownProblems = 200;
const defaultMaxResolutions = 200;
const defaultMaxLegacyCandidates = 500;

export type DoctorStateStorePaths = {
  readonly doctorRoot: string;
  readonly doctorRunsRoot: string;
  readonly latestRunPath: string;
  readonly knownProblemsPath: string;
  readonly resolutionsPath: string;
  readonly legacyRoot: string;
  readonly legacyCandidatesRoot: string;
  readonly legacyIndexPath: string;
  readonly legacyReviewsPath: string;
};

export type DoctorStateStoreOptions = {
  readonly maxRecentRuns?: number;
  readonly maxKnownProblems?: number;
  readonly maxResolutions?: number;
  readonly maxLegacyCandidates?: number;
};

export type DoctorStateWarning = {
  readonly code: "state-corrupt";
  readonly path: string;
  readonly message: string;
};

export type DoctorStateReadResult<T> = {
  readonly value: T;
  readonly warnings: readonly DoctorStateWarning[];
};

export type DoctorLatestRunPointer = {
  readonly schemaVersion: 1;
  readonly runId?: string;
  readonly recentRunIds: readonly string[];
};

export type KnownProblemIndex = {
  readonly schemaVersion: 1;
  readonly problems: readonly KnownProblemRecord[];
};

export type ResolutionIndex = {
  readonly schemaVersion: 1;
  readonly resolutions: readonly VerifiedResolutionRecord[];
};

export type LegacyCandidateIndex = {
  readonly schemaVersion: 1;
  readonly candidates: readonly LegacyCandidateRecord[];
};

export type DoctorStateStore = {
  readonly paths: DoctorStateStorePaths;
  readonly ensure: () => Promise<void>;
  readonly writeRun: (run: DoctorRun) => Promise<DoctorRun>;
  readonly readRun: (runId: string) => Promise<DoctorStateReadResult<DoctorRun | undefined>>;
  readonly listRuns: () => Promise<DoctorStateReadResult<readonly DoctorRun[]>>;
  readonly readLatestRun: () => Promise<DoctorStateReadResult<DoctorRun | undefined>>;
  readonly readLatestRunPointer: () => Promise<DoctorStateReadResult<DoctorLatestRunPointer>>;
  readonly readKnownProblems: () => Promise<DoctorStateReadResult<KnownProblemIndex>>;
  readonly writeKnownProblems: (
    problems: readonly KnownProblemRecord[]
  ) => Promise<KnownProblemIndex>;
  readonly readResolutions: () => Promise<DoctorStateReadResult<ResolutionIndex>>;
  readonly writeResolutions: (
    resolutions: readonly VerifiedResolutionRecord[]
  ) => Promise<ResolutionIndex>;
  readonly writeLegacyCandidate: (
    candidate: LegacyCandidateRecord
  ) => Promise<LegacyCandidateRecord>;
  readonly readLegacyCandidate: (
    candidateId: string
  ) => Promise<DoctorStateReadResult<LegacyCandidateRecord | undefined>>;
  readonly readLegacyCandidates: () => Promise<DoctorStateReadResult<LegacyCandidateIndex>>;
  readonly writeLegacyCandidates: (
    candidates: readonly LegacyCandidateRecord[]
  ) => Promise<LegacyCandidateIndex>;
};

export class DoctorStateStoreError extends Error {
  readonly code: "state-write-failed";
  readonly path: string;

  constructor(path: string, message: string) {
    super(message);
    this.name = "DoctorStateStoreError";
    this.code = "state-write-failed";
    this.path = path;
  }
}

export function resolveDoctorStateStorePaths(input: {
  readonly repositoryStateRoot: string;
}): DoctorStateStorePaths {
  const doctorRoot = join(input.repositoryStateRoot, "doctor");
  const legacyRoot = join(input.repositoryStateRoot, "legacy");

  return {
    doctorRoot,
    doctorRunsRoot: join(doctorRoot, "runs"),
    latestRunPath: join(doctorRoot, "latest.json"),
    knownProblemsPath: join(doctorRoot, "known-problems.json"),
    resolutionsPath: join(doctorRoot, "resolutions.json"),
    legacyRoot,
    legacyCandidatesRoot: join(legacyRoot, "candidates"),
    legacyIndexPath: join(legacyRoot, "index.json"),
    legacyReviewsPath: join(legacyRoot, "reviews.json")
  };
}

export function createJsonDoctorStateStore(
  paths: DoctorStateStorePaths,
  options: DoctorStateStoreOptions = {}
): DoctorStateStore {
  const limits = {
    maxRecentRuns: options.maxRecentRuns ?? defaultMaxRecentRuns,
    maxKnownProblems: options.maxKnownProblems ?? defaultMaxKnownProblems,
    maxResolutions: options.maxResolutions ?? defaultMaxResolutions,
    maxLegacyCandidates: options.maxLegacyCandidates ?? defaultMaxLegacyCandidates
  };

  return {
    paths,
    ensure: async () => {
      await mkdir(paths.doctorRoot, { recursive: true });
      await mkdir(paths.doctorRunsRoot, { recursive: true });
      await mkdir(paths.legacyRoot, { recursive: true });
      await mkdir(paths.legacyCandidatesRoot, { recursive: true });
    },
    writeRun: async (run) => {
      await writeJson(runPath(paths, run.runId), run);
      await updateLatestRun(paths, run.runId, limits.maxRecentRuns);
      return run;
    },
    readRun: async (runId) => readJson<DoctorRun | undefined>(runPath(paths, runId), undefined),
    listRuns: async () => {
      const entries = await readdir(paths.doctorRunsRoot).catch((error: unknown) => {
        if (isNotFoundError(error)) {
          return [];
        }

        throw error;
      });
      const reads = await Promise.all(
        entries
          .filter((entry) => entry.endsWith(".json"))
          .map((entry) =>
            readJson<DoctorRun | undefined>(join(paths.doctorRunsRoot, entry), undefined)
          )
      );

      return {
        value: reads
          .flatMap((read) => (read.value === undefined ? [] : [read.value]))
          .sort((left, right) => left.runId.localeCompare(right.runId)),
        warnings: reads.flatMap((read) => read.warnings)
      };
    },
    readLatestRun: async () => {
      const latest = await readLatestPointer(paths);

      if (latest.value.runId === undefined) {
        return {
          value: undefined,
          warnings: latest.warnings
        };
      }

      const run = await readJson<DoctorRun | undefined>(
        runPath(paths, latest.value.runId),
        undefined
      );

      return {
        value: run.value,
        warnings: [...latest.warnings, ...run.warnings]
      };
    },
    readLatestRunPointer: () => readLatestPointer(paths),
    readKnownProblems: () =>
      readJson<KnownProblemIndex>(paths.knownProblemsPath, {
        schemaVersion: 1,
        problems: []
      }),
    writeKnownProblems: async (problems) => {
      const index = {
        schemaVersion: 1,
        problems: [...problems]
          .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
          .slice(0, limits.maxKnownProblems)
      } satisfies KnownProblemIndex;
      await writeJson(paths.knownProblemsPath, index);
      return index;
    },
    readResolutions: () =>
      readJson<ResolutionIndex>(paths.resolutionsPath, {
        schemaVersion: 1,
        resolutions: []
      }),
    writeResolutions: async (resolutions) => {
      const index = {
        schemaVersion: 1,
        resolutions: [...resolutions]
          .sort((left, right) => right.resolvedAt.localeCompare(left.resolvedAt))
          .slice(0, limits.maxResolutions)
      } satisfies ResolutionIndex;
      await writeJson(paths.resolutionsPath, index);
      return index;
    },
    writeLegacyCandidate: async (candidate) => {
      await writeJson(legacyCandidatePath(paths, candidate.id), candidate);
      const existing = await readLegacyCandidateIndex(paths);
      const candidates = [
        candidate,
        ...existing.value.candidates.filter((item) => item.id !== candidate.id)
      ];
      await writeLegacyCandidateIndex(paths, candidates, limits.maxLegacyCandidates);
      return candidate;
    },
    readLegacyCandidate: (candidateId) =>
      readJson<LegacyCandidateRecord | undefined>(
        legacyCandidatePath(paths, candidateId),
        undefined
      ),
    readLegacyCandidates: () => readLegacyCandidateIndex(paths),
    writeLegacyCandidates: (candidates) =>
      writeLegacyCandidateIndex(paths, candidates, limits.maxLegacyCandidates)
  };
}

async function updateLatestRun(
  paths: DoctorStateStorePaths,
  runId: string,
  maxRecentRuns: number
): Promise<void> {
  const existing = await readLatestPointer(paths);
  const recentRunIds = [runId, ...existing.value.recentRunIds.filter((id) => id !== runId)].slice(
    0,
    maxRecentRuns
  );

  await writeJson(paths.latestRunPath, {
    schemaVersion: 1,
    runId,
    recentRunIds
  } satisfies DoctorLatestRunPointer);
}

async function readLatestPointer(
  paths: DoctorStateStorePaths
): Promise<DoctorStateReadResult<DoctorLatestRunPointer>> {
  return readJson<DoctorLatestRunPointer>(paths.latestRunPath, {
    schemaVersion: 1,
    recentRunIds: []
  });
}

async function readLegacyCandidateIndex(
  paths: DoctorStateStorePaths
): Promise<DoctorStateReadResult<LegacyCandidateIndex>> {
  return readJson<LegacyCandidateIndex>(paths.legacyIndexPath, {
    schemaVersion: 1,
    candidates: []
  });
}

async function writeLegacyCandidateIndex(
  paths: DoctorStateStorePaths,
  candidates: readonly LegacyCandidateRecord[],
  maxLegacyCandidates: number
): Promise<LegacyCandidateIndex> {
  const index = {
    schemaVersion: 1,
    candidates: [...candidates]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, maxLegacyCandidates)
  } satisfies LegacyCandidateIndex;

  await writeJson(paths.legacyIndexPath, index);

  return index;
}

async function readJson<T>(path: string, fallback: T): Promise<DoctorStateReadResult<T>> {
  let text: string;

  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        value: fallback,
        warnings: []
      };
    }

    throw error;
  }

  try {
    return {
      value: JSON.parse(text) as T,
      warnings: []
    };
  } catch {
    return {
      value: fallback,
      warnings: [
        {
          code: "state-corrupt",
          path,
          message: `Doctor state file ${path} contains invalid JSON.`
        }
      ]
    };
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    throw new DoctorStateStoreError(
      path,
      `Failed to write doctor state file ${path}: ${String(error)}`
    );
  }
}

function runPath(paths: DoctorStateStorePaths, runId: string): string {
  return join(paths.doctorRunsRoot, `${runId}.json`);
}

function legacyCandidatePath(paths: DoctorStateStorePaths, candidateId: string): string {
  return join(paths.legacyCandidatesRoot, `${candidateId}.json`);
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
