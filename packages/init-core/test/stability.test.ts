import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseRepositoryContract } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import { buildInitializeRepositoryReview, initializeRepository } from "../src/index.js";
import type { InitializeRepositoryResult } from "../src/index.js";

const initFixtureRoot = join(dirname(fileURLToPath(import.meta.url)), "fixtures/repos");

describe("init result stability", () => {
  it("reruns with stable proposal IDs, ordering, YAML, diffs, and JSON projection", async () => {
    const root = await copyFixture("missing-scripts");
    const first = await initializeRepository({
      root,
      includeUntracked: true
    });
    const second = await initializeRepository({
      root,
      includeUntracked: true
    });

    expect(first.proposalId).toBe(second.proposalId);
    expect(first.proposalId).toMatch(/^proposal-local-/);
    expect(artifactOrder(first)).toEqual([
      ".board:create",
      ".board/repository.yaml:create",
      "AGENTS.md:deferred",
      "docs/:deferred",
      ".board/skills/:deferred"
    ]);
    expect(artifactOrder(second)).toEqual(artifactOrder(first));
    expect(reviewItemOrder(second)).toEqual(reviewItemOrder(first));
    expect(scriptProposalOrder(second)).toEqual(scriptProposalOrder(first));
    expect(localAssumptionOrder(second)).toEqual(localAssumptionOrder(first));
    expect(contractArtifact(second).content).toBe(contractArtifact(first).content);
    expect(contractArtifact(second).diff).toBe(contractArtifact(first).diff);
    expect(contractArtifact(first).diff).toContain("--- /dev/null");
    expect(contractArtifact(first).diff).toContain("+++ b/.board/repository.yaml");
    expect(parseRepositoryContract(contractArtifact(first).content ?? "")).toMatchObject({
      repository: {
        name: "missing-scripts"
      }
    });
    expect(JSON.stringify(stabilityProjection(second))).toBe(
      JSON.stringify(stabilityProjection(first))
    );
  });

  it("keeps the structured review JSON shape stable", async () => {
    const root = await copyFixture("typescript-api-new");
    const result = await initializeRepository({
      root,
      includeUntracked: true
    });
    const review = buildInitializeRepositoryReview(result);

    expect(Object.keys(review)).toEqual([
      "proposalId",
      "mode",
      "approvalStatus",
      "approvalRequired",
      "repository",
      "scanSummary",
      "proposedFiles",
      "filesWritten",
      "discoveredFacts",
      "inferredFields",
      "unconfirmedFields",
      "approvalRequiredItems",
      "reviewItems",
      "scriptProposals",
      "localDevelopmentAssumptions",
      "knownLimitations",
      "validation",
      "workflowSteps",
      "warnings",
      "nextSteps"
    ]);
    expect(review.proposedFiles.map((file) => `${file.path}:${file.action}`)).toEqual([
      ".board:create",
      ".board/repository.yaml:create",
      "AGENTS.md:deferred",
      "docs/:deferred",
      ".board/skills/:deferred"
    ]);
    expect(JSON.parse(JSON.stringify(review))).toMatchObject({
      proposalId: result.proposalId,
      repository: {
        name: "typescript-api-new"
      },
      validation: {
        ok: true
      }
    });
  });
});

function stabilityProjection(result: InitializeRepositoryResult) {
  return {
    mode: result.mode,
    proposalId: result.proposalId,
    approvalStatus: result.approvalStatus,
    proposal: result.proposal,
    proposedContract: result.proposedContract,
    artifacts: result.artifacts.map((artifact) => ({
      path: artifact.path,
      action: artifact.action,
      proposalId: artifact.proposalId,
      approvalRequired: artifact.approvalRequired,
      proposedBy: artifact.proposedBy,
      reason: artifact.reason,
      warnings: artifact.warnings ?? [],
      content: artifact.content,
      diff: artifact.diff
    })),
    filesToCreate: result.filesToCreate,
    filesToUpdate: result.filesToUpdate,
    filesWritten: result.filesWritten,
    filesSkipped: result.filesSkipped,
    reviewItems: result.reviewItems,
    inferredFields: result.inferredFields,
    unconfirmedFields: result.unconfirmedFields,
    validation: result.validation,
    warnings: result.warnings,
    nextSteps: result.nextSteps,
    workflowSteps: result.workflowSteps,
    worktree: result.worktree,
    scriptProposals: result.scriptProposals,
    localDevelopmentAssumptions: result.localDevelopmentAssumptions,
    scan: {
      repository_root: result.scan.repository_root,
      facts: result.scan.facts,
      warnings: result.scan.warnings,
      errors: result.scan.errors,
      stats: result.scan.stats
    }
  };
}

function artifactOrder(result: InitializeRepositoryResult): readonly string[] {
  return result.artifacts.map((artifact) => `${artifact.path}:${artifact.action}`);
}

function reviewItemOrder(result: InitializeRepositoryResult): readonly string[] {
  return result.reviewItems.map((item) => item.id);
}

function scriptProposalOrder(result: InitializeRepositoryResult): readonly string[] {
  return result.scriptProposals.map((proposal) => proposal.id);
}

function localAssumptionOrder(result: InitializeRepositoryResult): readonly string[] {
  return result.localDevelopmentAssumptions.map((assumption) => assumption.id);
}

function contractArtifact(result: InitializeRepositoryResult) {
  const artifact = result.artifacts.find(
    (candidate) => candidate.path === ".board/repository.yaml"
  );

  if (artifact === undefined) {
    throw new Error("Expected .board/repository.yaml artifact.");
  }

  return artifact;
}

async function copyFixture(name: string): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), `board-init-stability-${name}-`));

  await cp(join(initFixtureRoot, name), target, {
    recursive: true,
    verbatimSymlinks: true
  });

  return target;
}
