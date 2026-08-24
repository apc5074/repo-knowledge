import { randomUUID } from "node:crypto";
import { cp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createJsonRuntimeStateStore,
  resolveRuntimeStateStorePaths,
  type BootstrapSession
} from "@repo-knowledge/bootstrap-runtime";
import {
  createJsonVerificationHistoryStore,
  resolveVerificationHistoryStorePaths,
  type VerificationCheckResult,
  type VerificationRun
} from "@repo-knowledge/verification-runtime";

import {
  createJsonDoctorStateStore,
  createLegacyCandidateStore,
  resolveDoctorStateStorePaths,
  stableLegacyCandidateId,
  type LegacyCandidateRecord
} from "../src/index.js";

export type DoctorFixtureRepository = "doctor-all-categories" | "doctor-false-positives";

export type CopiedDoctorFixture = {
  readonly root: string;
  readonly stateRoot: string;
  readonly contractPath: string;
};

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

export async function copyDoctorFixtureRepository(
  name: DoctorFixtureRepository
): Promise<CopiedDoctorFixture> {
  const root = join(tmpdir(), `doctor-fixture-${name}-${randomUUID()}`);
  const stateRoot = join(tmpdir(), `doctor-state-${name}-${randomUUID()}`);

  await cp(join(fixturesRoot, "repos", name), root, {
    recursive: true
  });
  await mkdir(join(root, ".git"), { recursive: true });
  await mkdir(stateRoot, { recursive: true });

  return {
    root,
    stateRoot,
    contractPath: join(root, ".board/repository.yaml")
  };
}

export async function seedFailedRuntimeState(repositoryStateRoot: string): Promise<void> {
  const store = createJsonRuntimeStateStore(resolveRuntimeStateStorePaths({ repositoryStateRoot }));
  await store.ensure();
  await store.createSession({
    id: "runtime-failed-fixture",
    repositoryRoot: "/fixture",
    status: "failed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:10.000Z",
    steps: [
      {
        id: "setup-migrate",
        kind: "setup",
        title: "Migrate database",
        status: "failed",
        summary: "Migration failed.",
        dependsOn: []
      }
    ],
    resources: [
      {
        id: "application-port-api-3000",
        kind: "port",
        status: "running",
        metadata: {
          port: 3000,
          host: "127.0.0.1"
        }
      }
    ],
    commandResults: [
      {
        id: "seed-users",
        command: "pnpm",
        args: ["db:seed"],
        cwd: "/fixture",
        status: "timed_out"
      }
    ],
    healthCheckResults: [
      {
        id: "api-health",
        target: "http://127.0.0.1:3000/health",
        status: "failed"
      }
    ],
    warnings: [],
    errors: ["fixture runtime failed"]
  } satisfies BootstrapSession);
}

export async function seedFailedVerificationHistory(repositoryStateRoot: string): Promise<void> {
  const store = createJsonVerificationHistoryStore(
    resolveVerificationHistoryStorePaths({ repositoryStateRoot })
  );
  await store.ensure();
  await store.writeRun(
    verificationRun("verification-failed-1", [
      verificationResult("typecheck", "failed"),
      verificationResult("stale-docs", "not_configured")
    ])
  );
  await store.writeRun(
    verificationRun("verification-failed-2", [verificationResult("typecheck", "failed")])
  );
}

export async function seedFalsePositiveLegacyReview(
  repositoryStateRoot: string
): Promise<LegacyCandidateRecord> {
  const stateStore = createJsonDoctorStateStore(
    resolveDoctorStateStorePaths({ repositoryStateRoot })
  );
  await stateStore.ensure();
  const store = createLegacyCandidateStore({ stateStore });
  const detectedAt = "2026-01-01T00:00:00.000Z";
  const candidate = {
    id: stableLegacyCandidateId({
      kind: "path",
      value: "src/v1/compat.js",
      path: "src/v1/compat.js"
    }),
    target: {
      kind: "path",
      value: "src/v1/compat.js",
      path: "src/v1/compat.js"
    },
    signalTypes: ["legacy.path_candidate_detected"],
    confidence: "low",
    status: "false_positive",
    detectedAt,
    updatedAt: detectedAt,
    evidence: [
      {
        kind: "scanner_fact",
        summary: "v1 compatibility path is intentionally supported.",
        path: "src/v1/compat.js"
      }
    ],
    counterEvidence: [
      {
        kind: "file",
        summary: "README documents active support for v1 compatibility.",
        path: "README.md"
      }
    ],
    replacementHints: [],
    suggestedReviewAction: "Keep this compatibility route unless support policy changes.",
    scannerFactIds: ["fixture-false-positive"]
  } satisfies LegacyCandidateRecord;

  return store.upsert(candidate);
}

function verificationRun(
  runId: string,
  results: readonly VerificationCheckResult[]
): VerificationRun {
  return {
    schemaVersion: 1,
    runId,
    repositoryRoot: "/fixture",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    status: "failed",
    changeSet: {
      mode: "git",
      paths: [],
      changedPaths: [],
      warnings: []
    },
    plan: {
      mode: "git",
      changeSet: {
        mode: "git",
        paths: [],
        changedPaths: [],
        warnings: []
      },
      selectedChecks: [],
      skippedChecks: [],
      warnings: []
    },
    results,
    summary: {
      total: results.length,
      passed: 0,
      failed: results.filter((result) => result.status === "failed").length,
      timedOut: 0,
      skipped: 0,
      blocked: 0,
      notConfigured: results.filter((result) => result.status === "not_configured").length,
      unknown: 0
    },
    warnings: [],
    errors: []
  };
}

function verificationResult(
  id: string,
  status: VerificationCheckResult["status"]
): VerificationCheckResult {
  return {
    id,
    status,
    source: "default",
    command: {
      command: "pnpm",
      args: [id]
    },
    evidence: []
  };
}
