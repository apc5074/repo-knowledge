import { describe, expect, it } from "vitest";

import {
  buildInitializeRepositoryResult,
  initApprovalStatuses,
  summarizeInitializeRepositoryResult,
  type InitializeRepositoryResult
} from "../src/index.js";

describe("initialization result model", () => {
  it("represents the full approval lifecycle", () => {
    expect(initApprovalStatuses).toEqual([
      "proposed",
      "approval-required",
      "approved",
      "rejected",
      "applied"
    ]);
  });

  it("builds proposal summaries from one structured result", () => {
    const result = buildInitializeRepositoryResult({
      mode: "dry-run",
      repositoryRoot: "/repo",
      proposalId: "proposal-local-test",
      approvalRequired: true,
      approvalStatus: "approval-required",
      scan: scanResult(),
      artifacts: [
        {
          path: ".board/repository.yaml",
          action: "create",
          requiresApproval: true
        }
      ],
      filesToCreate: [".board/repository.yaml"],
      filesToUpdate: [],
      filesWritten: [],
      filesSkipped: [],
      reviewItems: [
        {
          id: "repository-type-unconfirmed",
          kind: "confirmation-required",
          title: "Repository type needs review",
          summary: "Confirm the repository type."
        }
      ],
      inferredFields: ["repository.name"],
      unconfirmedFields: ["repository.type"],
      validation: {
        ok: true,
        issues: []
      },
      warnings: [],
      nextSteps: [],
      workflowSteps: [],
      scriptProposals: [],
      localDevelopmentAssumptions: []
    });

    expect(result.proposal).toEqual({
      factsRead: 1,
      artifactsProposed: 1,
      filesToCreate: 1,
      filesToUpdate: 0,
      reviewItems: 1
    });
    expect(summarizeInitializeRepositoryResult(result)).toBe(
      "Initialized proposal proposal-local-test; 1 files proposed; 1 scanner facts; 1 review items"
    );
  });
});

function scanResult(): InitializeRepositoryResult["scan"] {
  return {
    schema_version: 1,
    tool_name: "scan_repository",
    repository_root: "/repo",
    scanned_at: "2000-01-01T00:00:00.000Z",
    duration_ms: 0,
    facts: [
      {
        id: "language-typescript",
        kind: "language.detected",
        value: {
          language: "typescript",
          primary: true
        },
        confidence: "high",
        source: "deterministic",
        detector: "language",
        evidence: []
      }
    ],
    warnings: [],
    errors: [],
    stats: {
      detector_count: 1,
      detectors_succeeded: 1,
      detectors_failed: 0,
      facts_emitted: 1,
      warnings_emitted: 0,
      errors_emitted: 0,
      files_in_inventory: 1
    }
  };
}
