import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildInitializeRepositoryReview,
  formatInitializeRepositoryReview,
  initializeRepository
} from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("init review output", () => {
  it("builds a structured review shape for humans and agents", async () => {
    const result = await initializeRepository({
      root: fixture("typescript-api"),
      includeUntracked: true
    });
    const review = buildInitializeRepositoryReview(result);

    expect(review).toMatchObject({
      proposalId: result.proposalId,
      mode: "dry-run",
      approvalStatus: "approval-required",
      approvalRequired: true,
      repository: {
        name: "typescript-api"
      },
      scanSummary: {
        factsRead: expect.any(Number),
        filesRead: expect.any(Number)
      },
      validation: {
        ok: true
      }
    });
    expect(review.proposedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".board/repository.yaml",
          action: "create",
          hasDiff: true
        })
      ])
    );
    expect(review.discoveredFacts.length).toBeGreaterThan(0);
    expect(review.inferredFields).toContain("script_proposals");
    expect(review.approvalRequiredItems.length).toBeGreaterThan(0);
    expect(review.scriptProposals.length).toBeGreaterThan(0);
    expect(review.localDevelopmentAssumptions.length).toBeGreaterThan(0);
    expect(review.workflowSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "scan-repository",
          status: "completed"
        })
      ])
    );
  });

  it("formats a bounded human review with diff output", async () => {
    const result = await initializeRepository({
      root: fixture("typescript-api"),
      includeUntracked: true
    });
    const formatted = formatInitializeRepositoryReview(result);

    expect(formatted).toContain("board init proposal");
    expect(formatted).toContain("Scan:");
    expect(formatted).toContain("Proposed files:");
    expect(formatted).toContain("Key discovered facts:");
    expect(formatted).toContain("Inferred fields:");
    expect(formatted).toContain("Needs review:");
    expect(formatted).toContain("Script proposals:");
    expect(formatted).toContain("Local assumptions:");
    expect(formatted).toContain("Workflow:");
    expect(formatted).toContain("Diff .board/repository.yaml");
    expect(formatted).not.toContain("undefined");
  });
});

function fixture(name: string): string {
  return join(fixtureRoot, name);
}
