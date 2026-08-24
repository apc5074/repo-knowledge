import { describe, expect, it } from "vitest";

import {
  diagnosticConfidences,
  diagnosticFindingKinds,
  diagnosticSeverities,
  doctorDiagnosticCategories,
  doctorRuntimeBehavior,
  doctorRuntimeBoundary,
  doctorRuntimePackage,
  knownProblemStatuses,
  legacyCandidateReviewStatuses,
  type DiagnosticFinding,
  type DoctorRun,
  type KnownProblemRecord,
  type LegacyCandidateRecord,
  type VerifiedResolutionRecord
} from "../src/index.js";

describe("@repo-knowledge/doctor-runtime", () => {
  it("exports the doctor runtime package identity", () => {
    expect(doctorRuntimePackage).toEqual({
      name: "@repo-knowledge/doctor-runtime",
      owns: "local-diagnostics-known-problems-and-legacy-review",
      phase: "phase-7-doctor-runtime"
    });
  });

  it("defines initial diagnostic categories and local review statuses", () => {
    expect(doctorDiagnosticCategories).toContain("environment");
    expect(doctorDiagnosticCategories).toContain("verification");
    expect(doctorDiagnosticCategories).toContain("legacy");
    expect(knownProblemStatuses).toEqual([
      "observed",
      "matched",
      "acknowledged",
      "resolved",
      "ignored"
    ]);
    expect(legacyCandidateReviewStatuses).toContain("needs-info");
  });

  it("exports representative diagnostic and review record types", () => {
    const finding = {
      id: "finding-node-missing",
      ruleId: "environment.node.available",
      category: "environment",
      kind: "direct_local_fact",
      severity: "blocking",
      confidence: "confirmed",
      status: "open",
      title: "Node.js is missing",
      summary: "The node executable was not found on PATH.",
      evidence: [
        {
          kind: "command",
          summary: "node --version failed",
          command: "node --version",
          excerpt: {
            text: "command not found: node",
            redacted: true,
            truncated: false,
            maxCharacters: 2000
          }
        }
      ],
      counterEvidence: [],
      suggestedNextSteps: ["Install a supported Node.js version."],
      matchedKnownProblemIds: []
    } satisfies DiagnosticFinding;
    const knownProblem = {
      id: "known-node-missing",
      fingerprint: "environment:node:missing",
      title: finding.title,
      category: "environment",
      severity: "blocking",
      confidence: "confirmed",
      status: "unreviewed",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      occurrenceCount: 1,
      findingIds: [finding.id],
      evidence: finding.evidence,
      counterEvidence: [],
      suggestedNextSteps: finding.suggestedNextSteps
    } satisfies KnownProblemRecord;
    const resolution = {
      id: "resolution-node-installed",
      knownProblemId: knownProblem.id,
      resolvedAt: "2026-01-02T00:00:00.000Z",
      evidence: []
    } satisfies VerifiedResolutionRecord;
    const candidate = {
      id: "legacy-old-api",
      target: {
        kind: "route",
        value: "/v1/users",
        path: "src/routes/old-users.ts"
      },
      signalTypes: ["legacy.route_candidate_detected"],
      confidence: "low",
      status: "unreviewed",
      detectedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      evidence: [],
      counterEvidence: [],
      replacementHints: ["/v2/users"],
      suggestedReviewAction: "Confirm callers before removing this route.",
      scannerFactIds: ["fact-legacy-route"]
    } satisfies LegacyCandidateRecord;
    const run = {
      schemaVersion: 1,
      runId: "doctor-1",
      repositoryRoot: "/repo",
      startedAt: "2026-01-01T00:00:00.000Z",
      categories: ["environment", "legacy"],
      findings: [finding],
      knownProblemMatches: [],
      legacyCandidates: [candidate],
      warnings: [],
      errors: [],
      summary: {
        totalFindings: 1,
        bySeverity: {
          info: 0,
          warning: 0,
          error: 0,
          blocking: 1
        },
        byCategory: {
          environment: 1,
          runtime: 0,
          docker: 0,
          ports: 0,
          verification: 0,
          contract: 0,
          docs: 0,
          legacy: 0
        },
        directLocalFacts: 1,
        inferredCandidates: 0
      }
    } satisfies DoctorRun;

    expect(diagnosticSeverities).toEqual(["info", "warning", "error", "blocking"]);
    expect(diagnosticConfidences).toEqual(["low", "medium", "high", "confirmed"]);
    expect(diagnosticFindingKinds).toEqual(["direct_local_fact", "inferred_candidate"]);
    expect(run.findings[0]).toBe(finding);
    expect(knownProblem.evidence[0]?.excerpt?.redacted).toBe(true);
    expect(resolution.knownProblemId).toBe(knownProblem.id);
  });

  it("keeps the Phase 7 runtime boundary diagnostic-only", () => {
    expect(doctorRuntimeBehavior).toMatchObject({
      supportsJsonOutput: true,
      supportsDryRun: true,
      includeLogsByDefault: false,
      mutatesSourceCode: false,
      usesHostedServices: false,
      usesLlmCalls: false
    });
    expect(doctorRuntimeBoundary.owns).toContain("known local problem records");
    expect(doctorRuntimeBoundary.doesNotOwn).toContain("source mutation");
  });
});
