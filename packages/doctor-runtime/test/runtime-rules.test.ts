import { describe, expect, it } from "vitest";

import { createRuntimeFailureDiagnosticRules, runDiagnosticRules } from "../src/index.js";
import type { DiagnosticRuleContext, RuntimeSessionObservation } from "../src/index.js";

describe("runtime failure diagnostic rules", () => {
  it("creates findings for failed setup, migration, seed, health, process, and stale observations", () => {
    const result = runDiagnosticRules({
      rules: createRuntimeFailureDiagnosticRules(),
      context: contextWithRuntime([
        observation("failed_step", { stepId: "setup-install" }),
        observation("failed_migration", { stepId: "setup-migrate" }),
        observation("failed_seed", { commandResultId: "seed-data" }),
        observation("failed_health_check", { healthCheckId: "health-api" }),
        observation("failed_process", { commandResultId: "start-api" }),
        observation("stale_session", { severity: "warning" })
      ])
    });

    expect(result.findings.map((finding) => finding.title)).toEqual([
      "Runtime step failed",
      "Migration command failed",
      "Seed command failed",
      "Runtime health check failed",
      "Runtime command failed",
      "Runtime session appears stale"
    ]);
    expect(result.findings.at(-1)).toMatchObject({
      severity: "warning",
      confidence: "medium"
    });
  });

  it("groups repeated runtime failures for future known-problem matching", () => {
    const result = runDiagnosticRules({
      rules: createRuntimeFailureDiagnosticRules(),
      context: contextWithRuntime([
        observation("failed_health_check", {
          sessionId: "session-1",
          healthCheckId: "health-api"
        }),
        observation("failed_health_check", {
          sessionId: "session-2",
          healthCheckId: "health-api"
        })
      ])
    });
    const repeated = result.findings.find(
      (finding) => finding.ruleId === "runtime.repeated-failures"
    );

    expect(repeated).toMatchObject({
      id: "runtime.repeated.failed_health_check-health-api",
      severity: "warning",
      confidence: "high",
      kind: "inferred_candidate"
    });
    expect(repeated?.evidence.map((evidence) => evidence.runId)).toEqual([
      "session-1",
      "session-2"
    ]);
  });
});

function contextWithRuntime(
  observations: readonly RuntimeSessionObservation[]
): DiagnosticRuleContext {
  return {
    repository: {
      repositoryRoot: "/repo",
      contractPath: "/repo/.board/repository.yaml",
      git: {
        available: false,
        warnings: []
      },
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
    },
    runtime: {
      recentSessions: [],
      managedProcesses: [],
      observations,
      staleSessionIds: [],
      warnings: []
    }
  };
}

function observation(
  kind: RuntimeSessionObservation["kind"],
  input: Partial<RuntimeSessionObservation> = {}
): RuntimeSessionObservation {
  return {
    kind,
    sessionId: input.sessionId ?? "session-1",
    severity: input.severity ?? "error",
    summary: `${kind} happened.`,
    stepId: input.stepId,
    resourceId: input.resourceId,
    healthCheckId: input.healthCheckId,
    commandResultId: input.commandResultId
  };
}
