import { describe, expect, it } from "vitest";

import {
  createDiagnosticFinding,
  serializeDoctorToJson,
  stringifyDoctorJson,
  type DiagnosticEngineResult,
  type DoctorRun
} from "../src/index.js";

describe("doctor JSON output", () => {
  it("serializes a stable machine-readable doctor payload", () => {
    const output = serializeDoctorToJson({
      report: engineResult(),
      enabledInspectors: ["local-environment", "runtime"],
      statePaths: {
        run: ".board/state/doctor/runs/doctor-1.json",
        latest: ".board/state/doctor/latest.json",
        knownProblems: ".board/state/doctor/known-problems.json",
        legacyIndex: ".board/state/legacy/index.json"
      }
    });

    expect(output).toMatchObject({
      schema_version: 1,
      run_id: "doctor-1",
      repository_root: "/repo",
      contract_path: "/repo/.board/repository.yaml",
      contract_version: "1",
      enabled_inspectors: ["local-environment", "runtime"],
      skipped_inspectors: [{ name: "docker", reason: "disabled" }],
      state_paths: {
        run: ".board/state/doctor/runs/doctor-1.json",
        latest: ".board/state/doctor/latest.json",
        knownProblems: ".board/state/doctor/known-problems.json",
        legacyIndex: ".board/state/legacy/index.json"
      },
      summary: {
        totalFindings: 1
      }
    });
    expect(output.findings[0]?.evidence[0]).toMatchObject({
      kind: "command",
      command: "node --version"
    });
    expect(output.known_problem_matches).toEqual([
      {
        knownProblemId: "known-node",
        findingId: "finding-node",
        confidence: "confirmed",
        matchedOn: ["fingerprint"],
        evidence: []
      }
    ]);
    expect(output.legacy_candidates).toEqual([
      {
        id: "legacy-1",
        target: { kind: "path", value: "src/legacy.ts", path: "src/legacy.ts" },
        status: "unreviewed",
        confidence: "medium",
        signal_types: ["legacy.path_candidate_detected"],
        replacement_hints: ["src/new.ts"],
        suggested_review_action: "Review before changing source."
      }
    ]);
  });

  it("stringifies valid JSON without ANSI formatting or undefined fields", () => {
    const parsed = JSON.parse(stringifyDoctorJson({ report: run() })) as Record<string, unknown>;

    expect(parsed.schema_version).toBe(1);
    expect(JSON.stringify(parsed)).not.toContain("\u001B");
    expect(JSON.stringify(parsed)).not.toContain("undefined");
  });
});

function engineResult(): DiagnosticEngineResult {
  return {
    run: run(),
    ruleResult: {
      findings: [],
      skipped: [],
      warnings: []
    },
    context: {
      repository: {
        repositoryRoot: "/repo",
        contractPath: "/repo/.board/repository.yaml",
        git: { available: false, warnings: [] },
        componentIds: [],
        applicationIds: [],
        serviceIds: [],
        environmentNames: [],
        setupStepIds: [],
        verificationCheckIds: [],
        verificationRuleIds: [],
        generatedPathPatterns: [],
        documentationPathPatterns: [],
        knownLimitationIds: [],
        warnings: [],
        findings: []
      }
    },
    skippedInspectors: [{ name: "docker", reason: "disabled" }]
  };
}

function run(): DoctorRun {
  const finding = createDiagnosticFinding({
    id: "finding-node",
    ruleId: "environment.tools",
    category: "environment",
    severity: "blocking",
    confidence: "confirmed",
    title: "node is missing",
    summary: "node is required but was not available.",
    evidence: [{ kind: "command", summary: "node failed", command: "node --version" }]
  });

  return {
    schemaVersion: 1,
    runId: "doctor-1",
    repositoryRoot: "/repo",
    contractPath: "/repo/.board/repository.yaml",
    contractVersion: "1",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    categories: ["environment"],
    findings: [finding],
    knownProblemMatches: [
      {
        knownProblemId: "known-node",
        findingId: "finding-node",
        confidence: "confirmed",
        matchedOn: ["fingerprint"],
        evidence: []
      }
    ],
    legacyCandidates: [
      {
        id: "legacy-1",
        target: { kind: "path", value: "src/legacy.ts", path: "src/legacy.ts" },
        signalTypes: ["legacy.path_candidate_detected"],
        confidence: "medium",
        status: "unreviewed",
        detectedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        evidence: [],
        counterEvidence: [],
        replacementHints: ["src/new.ts"],
        suggestedReviewAction: "Review before changing source.",
        scannerFactIds: ["fact-1"]
      }
    ],
    warnings: [],
    errors: [],
    summary: {
      totalFindings: 1,
      bySeverity: { info: 0, warning: 0, error: 0, blocking: 1 },
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
  };
}
