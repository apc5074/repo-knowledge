import { describe, expect, it } from "vitest";

import {
  attachKnownProblemMatches,
  createDiagnosticFinding,
  createKnownProblemStore,
  createJsonDoctorStateStore,
  matchKnownProblems,
  resolveDoctorStateStorePaths
} from "../src/index.js";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("known problem matcher", () => {
  it("matches repeated same failure by deterministic fingerprint", async () => {
    const store = await storeFixture();
    const problem = await store.upsertFinding(finding("finding-1", "node --version"));
    const matches = matchKnownProblems({
      findings: [finding("finding-2", "node --version")],
      knownProblems: [problem]
    });

    expect(matches).toEqual([
      expect.objectContaining({
        knownProblemId: problem.id,
        findingId: "finding-2",
        confidence: "confirmed",
        matchedOn: expect.arrayContaining(["fingerprint"])
      })
    ]);
  });

  it("does not collide different targets", async () => {
    const store = await storeFixture();
    const problem = await store.upsertFinding(finding("finding-1", "node --version"));

    expect(
      matchKnownProblems({
        findings: [finding("finding-2", "python --version")],
        knownProblems: [problem]
      })
    ).toEqual([]);
  });

  it("normalizes volatile messages without requiring raw log text", async () => {
    const store = await storeFixture();
    const problem = await store.upsertFinding(
      finding("finding-1", "pnpm test", "Test failed at 2026-01-01T00:00:00Z")
    );
    const current = finding("finding-2", "pnpm test", "Test failed at 2026-01-02T00:00:00Z");

    expect(
      matchKnownProblems({
        findings: [current],
        knownProblems: [problem]
      })
    ).toEqual([
      expect.objectContaining({
        findingId: "finding-2",
        matchedOn: expect.arrayContaining(["fingerprint"])
      })
    ]);
  });

  it("attaches matched known-problem metadata to findings", async () => {
    const current = finding("finding-2", "node --version");
    const attached = attachKnownProblemMatches(
      [current],
      [
        {
          knownProblemId: "known-1",
          findingId: "finding-2",
          confidence: "confirmed",
          matchedOn: ["fingerprint"],
          evidence: current.evidence
        }
      ]
    );

    expect(attached).toEqual([
      expect.objectContaining({
        status: "matched_known_problem",
        matchedKnownProblemIds: ["known-1"]
      })
    ]);
  });
});

async function storeFixture() {
  const repositoryStateRoot = await mkdtemp(join(tmpdir(), "known-problem-match-"));
  const stateStore = createJsonDoctorStateStore(
    resolveDoctorStateStorePaths({ repositoryStateRoot })
  );
  await stateStore.ensure();
  return createKnownProblemStore({ stateStore });
}

function finding(id: string, command: string, title = "Tool failed") {
  return createDiagnosticFinding({
    id,
    ruleId: "environment.tools",
    category: "environment",
    severity: "blocking",
    confidence: "confirmed",
    title,
    summary: title,
    evidence: [
      {
        kind: "command",
        summary: "version failed",
        command
      }
    ]
  });
}
