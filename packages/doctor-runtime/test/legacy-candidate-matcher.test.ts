import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  createJsonDoctorStateStore,
  createLegacyCandidateStore,
  importLegacyCandidatesFromScannerFacts,
  resolveDoctorStateStorePaths
} from "../src/index.js";
import type { ScannerFact } from "@repo-knowledge/scanner-core";

describe("legacy candidate matcher", () => {
  it("handles missing scanner facts", async () => {
    await expect(importLegacyCandidatesFromScannerFacts({ facts: [] })).resolves.toEqual({
      candidates: [],
      warnings: ["No scanner legacy facts were available."]
    });
  });

  it("imports scanner facts as reviewable local candidates", async () => {
    const result = await importLegacyCandidatesFromScannerFacts({
      facts: [legacyPathFact(), replacementFact("src/legacy/auth.ts", "src/auth/new-auth.ts")],
      detectedAt: "2026-01-01T00:00:00.000Z",
      commitSha: "abc123",
      inputFingerprint: "scan-1"
    });

    expect(result.candidates).toEqual([
      expect.objectContaining({
        target: {
          kind: "path",
          value: "src/legacy/auth.ts",
          path: "src/legacy/auth.ts"
        },
        status: "unreviewed",
        confidence: "medium",
        replacementHints: ["src/auth/new-auth.ts"],
        scannerFactIds: ["fact-path"],
        commitSha: "abc123",
        inputFingerprint: "scan-1"
      })
    ]);
    expect(result.candidates[0]?.counterEvidence).toEqual([
      expect.objectContaining({
        summary: "Path naming can be intentional compatibility support."
      })
    ]);
  });

  it("updates existing candidates through the store instead of duplicating them", async () => {
    const repositoryStateRoot = await mkdtemp(join(tmpdir(), "legacy-candidate-import-"));
    const stateStore = createJsonDoctorStateStore(
      resolveDoctorStateStorePaths({ repositoryStateRoot })
    );
    await stateStore.ensure();
    const store = createLegacyCandidateStore({ stateStore });

    const first = await importLegacyCandidatesFromScannerFacts({
      facts: [legacyPathFact()],
      store,
      detectedAt: "2026-01-01T00:00:00.000Z"
    });
    const second = await importLegacyCandidatesFromScannerFacts({
      facts: [
        {
          ...legacyPathFact(),
          id: "fact-path-2",
          confidence: "high"
        }
      ],
      store,
      detectedAt: "2026-01-02T00:00:00.000Z"
    });

    expect(second.candidates[0]?.id).toBe(first.candidates[0]?.id);
    expect(second.candidates[0]).toMatchObject({
      confidence: "high",
      scannerFactIds: ["fact-path", "fact-path-2"]
    });
    await expect(store.readAll()).resolves.toMatchObject({
      value: {
        candidates: [
          expect.objectContaining({
            id: second.candidates[0]?.id,
            confidence: "high",
            scannerFactIds: ["fact-path", "fact-path-2"]
          })
        ]
      }
    });
  });
});

function legacyPathFact(): ScannerFact {
  return {
    id: "fact-path",
    kind: "legacy.path_candidate_detected",
    value: {
      path: "src/legacy/auth.ts",
      signal: "legacy-like path name",
      caveat: "Path naming can be intentional compatibility support.",
      reviewed: false
    },
    confidence: "medium",
    source: "deterministic",
    detector: "legacy",
    evidence: [
      {
        kind: "source",
        source_path: "src/legacy/auth.ts",
        line_start: 1,
        detector: "legacy",
        excerpt: "legacy auth"
      }
    ]
  };
}

function replacementFact(target: string, replacement: string): ScannerFact {
  return {
    id: "fact-replacement",
    kind: "legacy.replacement_detected",
    value: {
      target,
      replacement,
      source: target
    },
    confidence: "high",
    source: "deterministic",
    detector: "legacy",
    evidence: [
      {
        kind: "source",
        source_path: target,
        line_start: 1,
        detector: "legacy",
        excerpt: `replaced by ${replacement}`
      }
    ]
  };
}
