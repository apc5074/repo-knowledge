import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  createDiagnosticFinding,
  createJsonDoctorStateStore,
  createKnownProblemStore,
  createResolutionStore,
  resolveDoctorStateStorePaths
} from "../src/index.js";

describe("resolution store", () => {
  it("records direct resolution evidence and keeps records queryable", async () => {
    const { knownProblemStore, resolutionStore } = await stores();
    const problem = await knownProblemStore.upsertFinding(finding());
    const record = await resolutionStore.resolveKnownProblem({
      problem,
      verificationRunId: "verify-1",
      evidence: [
        {
          kind: "verification_run",
          summary: "typecheck passed",
          command: "pnpm typecheck",
          metadata: {
            status: "passed"
          }
        }
      ],
      notes: "Confirmed by verification."
    });

    expect(record).toMatchObject({
      id: "resolution-fixed",
      knownProblemId: problem.id,
      verificationRunId: "verify-1",
      notes: "Confirmed by verification."
    });
    await expect(resolutionStore.readAll()).resolves.toMatchObject({
      value: {
        schemaVersion: 1,
        resolutions: [record]
      }
    });
  });

  it("does not resolve from insufficient evidence", async () => {
    const { knownProblemStore, resolutionStore } = await stores();
    const problem = await knownProblemStore.upsertFinding(finding());

    await expect(
      resolutionStore.resolveKnownProblem({
        problem,
        evidence: [
          {
            kind: "verification_run",
            summary: "unrelated check passed",
            command: "pnpm lint",
            metadata: {
              status: "passed"
            }
          }
        ]
      })
    ).resolves.toBeUndefined();
  });

  it("can record explicit reviewable resolution records", async () => {
    const { resolutionStore } = await stores();

    await expect(
      resolutionStore.recordResolution({
        knownProblemId: "known-1",
        resolvedAt: "2026-01-01T00:00:00.000Z",
        evidence: [
          {
            kind: "runtime_session",
            summary: "health check succeeded",
            metadata: {
              status: "succeeded"
            }
          }
        ]
      })
    ).resolves.toMatchObject({
      id: "resolution-fixed",
      knownProblemId: "known-1",
      resolvedAt: "2026-01-01T00:00:00.000Z"
    });
  });
});

async function stores() {
  const repositoryStateRoot = await mkdtemp(join(tmpdir(), "resolution-store-"));
  const stateStore = createJsonDoctorStateStore(
    resolveDoctorStateStorePaths({ repositoryStateRoot })
  );
  await stateStore.ensure();
  return {
    knownProblemStore: createKnownProblemStore({ stateStore }),
    resolutionStore: createResolutionStore({
      stateStore,
      now: () => "2026-01-02T00:00:00.000Z",
      id: () => "fixed"
    })
  };
}

function finding() {
  return createDiagnosticFinding({
    id: "finding-typecheck",
    ruleId: "verification.observations",
    category: "verification",
    severity: "error",
    confidence: "confirmed",
    title: "Typecheck failed",
    summary: "Typecheck failed.",
    evidence: [
      {
        kind: "verification_run",
        summary: "typecheck failed",
        command: "pnpm typecheck",
        metadata: {
          status: "failed"
        }
      }
    ]
  });
}
