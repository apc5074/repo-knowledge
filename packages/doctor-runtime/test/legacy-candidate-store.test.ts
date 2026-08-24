import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  createJsonDoctorStateStore,
  createLegacyCandidateStore,
  resolveDoctorStateStorePaths,
  stableLegacyCandidateId,
  type LegacyCandidateRecord
} from "../src/index.js";

describe("legacy candidate store", () => {
  it("creates, lists, reads, and explains candidates", async () => {
    const store = await storeFixture();
    const candidate = candidateRecord("src/legacy/auth.ts");

    await expect(store.upsert(candidate)).resolves.toEqual(candidate);
    await expect(store.read(candidate.id)).resolves.toMatchObject({
      value: candidate,
      warnings: []
    });
    await expect(store.readAll()).resolves.toMatchObject({
      value: {
        schemaVersion: 1,
        candidates: [candidate]
      },
      warnings: []
    });
  });

  it("updates unchanged targets instead of duplicating candidates", async () => {
    const store = await storeFixture();
    const first = candidateRecord("src/legacy/auth.ts");
    const second = {
      ...candidateRecord("src/legacy/auth.ts", "2026-01-02T00:00:00.000Z"),
      confidence: "high",
      signalTypes: ["legacy.marker_detected"],
      replacementHints: ["src/auth/new-auth.ts"],
      scannerFactIds: ["fact-2"]
    } satisfies LegacyCandidateRecord;

    await store.upsert(first);
    const updated = await store.upsert(second);

    expect(updated.id).toBe(first.id);
    expect(updated).toMatchObject({
      confidence: "high",
      signalTypes: ["legacy.path_candidate_detected", "legacy.marker_detected"],
      replacementHints: ["src/auth/new-auth.ts"],
      scannerFactIds: ["fact-1", "fact-2"]
    });
    await expect(store.readAll()).resolves.toMatchObject({
      value: {
        candidates: [
          expect.objectContaining({
            id: updated.id,
            confidence: "high",
            scannerFactIds: ["fact-1", "fact-2"]
          })
        ]
      }
    });
  });

  it("persists review status updates", async () => {
    const store = await storeFixture();
    const candidate = await store.upsert(candidateRecord("src/legacy/auth.ts"));

    await expect(
      store.updateReviewStatus(candidate.id, "accepted", {
        note: "Confirmed legacy code.",
        updatedAt: "2026-01-03T00:00:00.000Z"
      })
    ).resolves.toMatchObject({
      id: candidate.id,
      status: "accepted",
      reviewerNotes: ["Confirmed legacy code."],
      updatedAt: "2026-01-03T00:00:00.000Z"
    });
  });

  it("creates stable IDs for unchanged targets", () => {
    expect(
      stableLegacyCandidateId({
        kind: "path",
        value: "src/legacy/auth.ts",
        path: "src/legacy/auth.ts"
      })
    ).toBe(
      stableLegacyCandidateId({
        kind: "path",
        value: "src/legacy/auth.ts",
        path: "src/legacy/auth.ts"
      })
    );
  });
});

async function storeFixture() {
  const repositoryStateRoot = await mkdtemp(join(tmpdir(), "legacy-candidate-store-"));
  const stateStore = createJsonDoctorStateStore(
    resolveDoctorStateStorePaths({ repositoryStateRoot })
  );
  await stateStore.ensure();
  return createLegacyCandidateStore({ stateStore });
}

function candidateRecord(
  path: string,
  updatedAt = "2026-01-01T00:00:00.000Z"
): LegacyCandidateRecord {
  return {
    id: stableLegacyCandidateId({ kind: "path", value: path, path }),
    target: {
      kind: "path",
      value: path,
      path
    },
    signalTypes: ["legacy.path_candidate_detected"],
    confidence: "medium",
    status: "unreviewed",
    detectedAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    evidence: [
      {
        kind: "scanner_fact",
        summary: "legacy path detected",
        path
      }
    ],
    counterEvidence: [],
    replacementHints: [],
    suggestedReviewAction: "Review before changing source.",
    scannerFactIds: ["fact-1"]
  };
}
