import { describe, expect, it } from "vitest";

import { createDiagnosticFinding, formatHumanDoctorReport, type DoctorRun } from "../src/index.js";

describe("human doctor report", () => {
  it("formats compact clean output", () => {
    expect(formatHumanDoctorReport(run([])).human).toBe(
      "Doctor found no local problems for doctor-1."
    );
  });

  it("puts blocking findings first and shows known-problem matches", () => {
    const blocking = {
      ...createDiagnosticFinding({
        id: "finding-node",
        ruleId: "environment.tools",
        category: "environment",
        severity: "blocking",
        confidence: "confirmed",
        title: "node is missing",
        summary: "node is required but was not available.",
        suggestedNextSteps: ["Install node."]
      }),
      status: "matched_known_problem",
      matchedKnownProblemIds: ["known-node"]
    } as const;
    const warning = createDiagnosticFinding({
      id: "finding-legacy",
      ruleId: "legacy",
      category: "legacy",
      severity: "warning",
      confidence: "medium",
      title: "Legacy route candidate",
      summary: "Route may be deprecated.",
      counterEvidence: [{ kind: "file", summary: "Candidate only." }]
    });
    const report = formatHumanDoctorReport({
      ...run([warning, blocking]),
      knownProblemMatches: [
        {
          knownProblemId: "known-node",
          findingId: "finding-node",
          confidence: "confirmed",
          matchedOn: ["fingerprint"],
          evidence: []
        }
      ]
    });

    expect(report.human).toContain("Blocking:\n  [environment] node is missing");
    expect(report.human).toContain("Known problem: known-node");
    expect(report.human).toContain("Candidate only; review before changing source.");
    expect(report.human).toContain("Known Problem Matches:");
  });

  it("includes redacted bounded logs only when enabled", () => {
    const finding = createDiagnosticFinding({
      id: "finding-log",
      ruleId: "runtime.failures",
      category: "runtime",
      severity: "error",
      confidence: "confirmed",
      title: "Runtime command failed",
      summary: "Command failed.",
      evidence: [
        {
          kind: "log_excerpt",
          summary: "stderr",
          excerpt: {
            text: "TOKEN=[redacted]",
            redacted: true,
            truncated: true,
            maxCharacters: 20
          }
        }
      ]
    });

    expect(formatHumanDoctorReport(run([finding])).human).not.toContain("TOKEN");
    expect(formatHumanDoctorReport(run([finding]), { includeLogs: true }).human).toContain(
      "Log (truncated): TOKEN=[redacted]"
    );
  });

  it("shows local run record path", () => {
    expect(
      formatHumanDoctorReport(run([]), { runRecordPath: ".board/state/doctor/latest.json" }).human
    ).toContain("Run record: .board/state/doctor/latest.json");
  });
});

function run(findings: DoctorRun["findings"]): DoctorRun {
  return {
    schemaVersion: 1,
    runId: "doctor-1",
    repositoryRoot: "/repo",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    categories: [],
    findings,
    knownProblemMatches: [],
    legacyCandidates: [],
    warnings: [],
    errors: [],
    summary: {
      totalFindings: findings.length,
      bySeverity: {
        info: findings.filter((finding) => finding.severity === "info").length,
        warning: findings.filter((finding) => finding.severity === "warning").length,
        error: findings.filter((finding) => finding.severity === "error").length,
        blocking: findings.filter((finding) => finding.severity === "blocking").length
      },
      byCategory: {
        environment: findings.filter((finding) => finding.category === "environment").length,
        runtime: findings.filter((finding) => finding.category === "runtime").length,
        docker: findings.filter((finding) => finding.category === "docker").length,
        ports: findings.filter((finding) => finding.category === "ports").length,
        verification: findings.filter((finding) => finding.category === "verification").length,
        contract: findings.filter((finding) => finding.category === "contract").length,
        docs: findings.filter((finding) => finding.category === "docs").length,
        legacy: findings.filter((finding) => finding.category === "legacy").length
      },
      directLocalFacts: findings.filter((finding) => finding.kind === "direct_local_fact").length,
      inferredCandidates: findings.filter((finding) => finding.kind === "inferred_candidate").length
    }
  };
}
