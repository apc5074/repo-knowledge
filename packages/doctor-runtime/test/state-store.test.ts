import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  createJsonDoctorStateStore,
  resolveDoctorStateStorePaths,
  type DoctorRun,
  type KnownProblemRecord,
  type LegacyCandidateRecord,
  type VerifiedResolutionRecord
} from "../src/index.js";

describe("doctor state store", () => {
  it("persists doctor runs and tracks the latest bounded run list", async () => {
    const store = await createStore({ maxRecentRuns: 2 });
    const first = run("run-1");
    const second = run("run-2");
    const third = run("run-3");

    await store.writeRun(first);
    await store.writeRun(second);
    await store.writeRun(third);

    await expect(store.readRun("run-1")).resolves.toMatchObject({ value: first, warnings: [] });
    await expect(store.readLatestRun()).resolves.toMatchObject({ value: third, warnings: [] });
    await expect(store.readLatestRunPointer()).resolves.toMatchObject({
      value: {
        schemaVersion: 1,
        runId: "run-3",
        recentRunIds: ["run-3", "run-2"]
      },
      warnings: []
    });
  });

  it("persists known problems, resolutions, and legacy candidates with bounded indexes", async () => {
    const store = await createStore({
      maxKnownProblems: 1,
      maxResolutions: 1,
      maxLegacyCandidates: 1
    });
    const olderProblem = knownProblem("problem-1", "2026-01-01T00:00:00.000Z");
    const newerProblem = knownProblem("problem-2", "2026-01-02T00:00:00.000Z");
    const olderResolution = resolution("resolution-1", "2026-01-01T00:00:00.000Z");
    const newerResolution = resolution("resolution-2", "2026-01-02T00:00:00.000Z");
    const olderCandidate = legacyCandidate("candidate-1", "2026-01-01T00:00:00.000Z");
    const newerCandidate = legacyCandidate("candidate-2", "2026-01-02T00:00:00.000Z");

    await expect(store.writeKnownProblems([olderProblem, newerProblem])).resolves.toMatchObject({
      problems: [newerProblem]
    });
    await expect(store.writeResolutions([olderResolution, newerResolution])).resolves.toMatchObject(
      {
        resolutions: [newerResolution]
      }
    );
    await store.writeLegacyCandidate(olderCandidate);
    await store.writeLegacyCandidate(newerCandidate);

    await expect(store.readKnownProblems()).resolves.toMatchObject({
      value: { schemaVersion: 1, problems: [newerProblem] },
      warnings: []
    });
    await expect(store.readResolutions()).resolves.toMatchObject({
      value: { schemaVersion: 1, resolutions: [newerResolution] },
      warnings: []
    });
    await expect(store.readLegacyCandidate("candidate-2")).resolves.toMatchObject({
      value: newerCandidate,
      warnings: []
    });
    await expect(store.readLegacyCandidates()).resolves.toMatchObject({
      value: { schemaVersion: 1, candidates: [newerCandidate] },
      warnings: []
    });
  });

  it("returns empty state for missing records", async () => {
    const store = await createStore();

    await expect(store.readRun("missing")).resolves.toEqual({ value: undefined, warnings: [] });
    await expect(store.readLatestRun()).resolves.toEqual({ value: undefined, warnings: [] });
    await expect(store.readKnownProblems()).resolves.toEqual({
      value: { schemaVersion: 1, problems: [] },
      warnings: []
    });
    await expect(store.readLegacyCandidates()).resolves.toEqual({
      value: { schemaVersion: 1, candidates: [] },
      warnings: []
    });
  });

  it("reports corrupted records as recoverable warnings", async () => {
    const store = await createStore();

    await writeFile(store.paths.knownProblemsPath, "{", "utf8");
    await writeFile(join(store.paths.doctorRunsRoot, "bad.json"), "{", "utf8");

    const knownProblems = await store.readKnownProblems();
    const runs = await store.listRuns();

    expect(knownProblems.value).toEqual({ schemaVersion: 1, problems: [] });
    expect(knownProblems.warnings).toHaveLength(1);
    expect(knownProblems.warnings[0]?.code).toBe("state-corrupt");
    expect(runs.value).toEqual([]);
    expect(runs.warnings).toHaveLength(1);
  });
});

async function createStore(options = {}) {
  const repositoryStateRoot = await mkdtemp(join(tmpdir(), "doctor-state-"));
  const store = createJsonDoctorStateStore(
    resolveDoctorStateStorePaths({ repositoryStateRoot }),
    options
  );
  await store.ensure();
  return store;
}

function run(runId: string): DoctorRun {
  return {
    schemaVersion: 1,
    runId,
    repositoryRoot: "/repo",
    startedAt: "2026-01-01T00:00:00.000Z",
    categories: ["environment"],
    findings: [],
    knownProblemMatches: [],
    legacyCandidates: [],
    warnings: [],
    errors: [],
    summary: {
      totalFindings: 0,
      bySeverity: {
        info: 0,
        warning: 0,
        error: 0,
        blocking: 0
      },
      byCategory: {
        environment: 0,
        runtime: 0,
        docker: 0,
        ports: 0,
        verification: 0,
        contract: 0,
        docs: 0,
        legacy: 0
      },
      directLocalFacts: 0,
      inferredCandidates: 0
    }
  };
}

function knownProblem(id: string, lastSeenAt: string): KnownProblemRecord {
  return {
    id,
    fingerprint: id,
    title: id,
    category: "environment",
    severity: "warning",
    confidence: "high",
    status: "unreviewed",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt,
    occurrenceCount: 1,
    findingIds: [],
    evidence: [],
    counterEvidence: [],
    suggestedNextSteps: []
  };
}

function resolution(id: string, resolvedAt: string): VerifiedResolutionRecord {
  return {
    id,
    knownProblemId: "problem",
    resolvedAt,
    evidence: []
  };
}

function legacyCandidate(id: string, updatedAt: string): LegacyCandidateRecord {
  return {
    id,
    target: {
      kind: "path",
      value: "src/legacy.ts",
      path: "src/legacy.ts"
    },
    signalTypes: ["legacy.path_candidate_detected"],
    confidence: "medium",
    status: "unreviewed",
    detectedAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    evidence: [],
    counterEvidence: [],
    replacementHints: [],
    suggestedReviewAction: "Review before changing source.",
    scannerFactIds: []
  };
}
