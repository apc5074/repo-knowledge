import { describe, expect, it } from "vitest";
import type { ScannerFact } from "@repo-knowledge/scanner-core";

import {
  attachKnownProblemMatches,
  createDiagnosticFinding,
  createJsonDoctorStateStore,
  createKnownProblemStore,
  createLegacyCandidateStore,
  createResolutionStore,
  importLegacyCandidatesFromScannerFacts,
  matchKnownProblems,
  resolveDoctorStateStorePaths
} from "../src/index.js";
import { copyDoctorFixtureRepository, seedFalsePositiveLegacyReview } from "./fixtures.js";

describe("rule, matcher, and store fixture edge cases", () => {
  it("does not over-merge same-title known problems with unrelated targets", async () => {
    const stateStore = await stateStoreFixture();
    const knownProblemStore = createKnownProblemStore({ stateStore });
    const first = findingWithTarget("finding-node", "node --version");
    const unrelated = findingWithTarget("finding-pnpm", "pnpm --version");
    const problem = await knownProblemStore.upsertFinding(first);

    const matches = matchKnownProblems({
      findings: [unrelated],
      knownProblems: [problem]
    });

    expect(matches).toEqual([]);
    expect(attachKnownProblemMatches([unrelated], matches)[0]).toMatchObject({
      status: "open",
      matchedKnownProblemIds: []
    });
  });

  it("increments known-problem occurrence metadata across repeated local runs", async () => {
    const stateStore = await stateStoreFixture();
    const knownProblemStore = createKnownProblemStore({ stateStore });

    await knownProblemStore.upsertFinding(findingWithTarget("first-run", "pnpm test"), {
      observedAt: "2026-01-01T00:00:00.000Z",
      notes: ["run:1"]
    });
    const repeated = await knownProblemStore.upsertFinding(
      findingWithTarget("second-run", "pnpm test"),
      {
        observedAt: "2026-01-02T00:00:00.000Z",
        notes: ["run:2"]
      }
    );

    expect(repeated).toMatchObject({
      occurrenceCount: 2,
      findingIds: ["second-run", "first-run"],
      notes: ["run:1", "run:2"],
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-02T00:00:00.000Z"
    });
  });

  it("requires direct resolution evidence before resolving known problems", async () => {
    const stateStore = await stateStoreFixture();
    const knownProblemStore = createKnownProblemStore({ stateStore });
    const resolutionStore = createResolutionStore({
      stateStore,
      id: () => "fixture",
      now: () => "2026-01-03T00:00:00.000Z"
    });
    const problem = await knownProblemStore.upsertFinding(
      createDiagnosticFinding({
        id: "verification-failed",
        ruleId: "verification.observations",
        category: "verification",
        severity: "error",
        confidence: "confirmed",
        title: "Verification failed",
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
      })
    );

    await expect(
      resolutionStore.resolveKnownProblem({
        problem,
        evidence: [
          {
            kind: "verification_run",
            summary: "lint passed",
            command: "pnpm lint",
            metadata: {
              status: "passed"
            }
          }
        ]
      })
    ).resolves.toBeUndefined();

    await expect(
      resolutionStore.resolveKnownProblem({
        problem,
        verificationRunId: "verify-fixed",
        evidence: [
          {
            kind: "verification_run",
            summary: "typecheck passed",
            command: "pnpm typecheck",
            metadata: {
              status: "passed"
            }
          }
        ]
      })
    ).resolves.toMatchObject({
      id: "resolution-fixture",
      knownProblemId: problem.id,
      verificationRunId: "verify-fixed"
    });
  });

  it("preserves false-positive legacy review status when scanner facts rediscover a candidate", async () => {
    const fixture = await copyDoctorFixtureRepository("doctor-false-positives");
    const reviewed = await seedFalsePositiveLegacyReview(fixture.stateRoot);
    const stateStore = createJsonDoctorStateStore(
      resolveDoctorStateStorePaths({ repositoryStateRoot: fixture.stateRoot })
    );
    await importLegacyCandidatesFromScannerFacts({
      facts: [
        {
          id: "rediscovered",
          kind: "legacy.path_candidate_detected",
          detector: "fixture",
          confidence: "medium",
          value: {
            path: "src/v1/compat.js",
            caveat: "Versioned compatibility paths can be intentional."
          },
          evidence: [
            {
              kind: "filesystem",
              source_path: "src/v1/compat.js",
              line_start: 1,
              line_end: 1
            }
          ]
        } satisfies ScannerFact
      ],
      store: createLegacyCandidateStore({ stateStore })
    });

    const stored = await stateStore.readLegacyCandidate(reviewed.id);

    expect(stored.value).toMatchObject({
      id: reviewed.id,
      status: "false_positive",
      confidence: "medium",
      counterEvidence: expect.arrayContaining([
        expect.objectContaining({
          summary: "README documents active support for v1 compatibility."
        })
      ])
    });
  });
});

async function stateStoreFixture() {
  const fixture = await copyDoctorFixtureRepository("doctor-all-categories");
  const stateStore = createJsonDoctorStateStore(
    resolveDoctorStateStorePaths({ repositoryStateRoot: fixture.stateRoot })
  );
  await stateStore.ensure();
  return stateStore;
}

function findingWithTarget(id: string, command: string) {
  return createDiagnosticFinding({
    id,
    ruleId: "environment.tools",
    category: "environment",
    severity: "blocking",
    confidence: "confirmed",
    title: "Tool failed",
    summary: "A local tool failed.",
    evidence: [
      {
        kind: "command",
        summary: `${command} failed`,
        command
      }
    ]
  });
}
