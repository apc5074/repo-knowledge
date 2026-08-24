import { describe, expect, it } from "vitest";

import { createVerificationDiagnosticRules, runDiagnosticRules } from "../src/index.js";
import type { DiagnosticRuleContext } from "../src/index.js";

describe("verification diagnostic rules", () => {
  it("creates findings for failed, timed-out, repeated, blocked, skipped, and missing-command checks", () => {
    const result = runDiagnosticRules({
      rules: createVerificationDiagnosticRules(),
      context: {
        ...baseContext(),
        verification: {
          history: { schemaVersion: 1, runs: [] },
          recentRuns: [],
          warnings: [],
          observations: [
            observation("failed_check", "lint", "failed"),
            observation("failed_check", "typecheck", "timed_out"),
            observation("repeated_failure", "test", "failed", ["run-2", "run-1"], 2),
            observation("blocked_check", "integration", "blocked"),
            observation("skipped_check", "smoke", "skipped"),
            observation("missing_configured_command", "contract", "not_configured")
          ]
        }
      }
    });

    expect(result.findings.map((finding) => finding.title)).toEqual([
      "Verification check failed",
      "Verification check timed out",
      "Verification check failed repeatedly",
      "Verification check is blocked",
      "Verification check was skipped",
      "Verification check is missing configuration"
    ]);
    expect(
      result.findings.find((finding) => finding.id === "verification.repeated_failure.test")
    ).toMatchObject({
      kind: "inferred_candidate",
      confidence: "high"
    });
  });

  it("reports stale verification path and component references", () => {
    const result = runDiagnosticRules({
      rules: createVerificationDiagnosticRules(),
      context: {
        ...baseContext(),
        repositoryInventory: {
          paths: ["src/api/index.ts"],
          commands: []
        },
        repository: {
          ...baseContext().repository,
          componentIds: ["api"],
          contract: {
            version: 1,
            repository: {
              name: "verification-fixture",
              type: "service",
              primary_language: "typescript"
            },
            verification: {
              default: [
                {
                  id: "api-check",
                  command: {
                    command: "pnpm",
                    args: ["test"]
                  },
                  paths: ["src/api/**"],
                  components: ["api"]
                },
                {
                  id: "old-check",
                  command: {
                    command: "pnpm",
                    args: ["test"]
                  },
                  paths: ["src/old/**"],
                  components: ["old-api"]
                }
              ]
            }
          }
        }
      }
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        id: "verification.path.old-check.src-old.missing",
        title: "Verification check references a missing path"
      }),
      expect.objectContaining({
        id: "verification.component.old-check.old-api.missing",
        title: "Verification check references a missing component"
      })
    ]);
  });
});

function observation(
  kind: Parameters<typeof makeObservation>[0],
  checkId: string,
  status: string,
  runIds = ["run-1"],
  count = 1
) {
  return makeObservation(kind, checkId, status, runIds, count);
}

function makeObservation(
  kind:
    | "failed_check"
    | "repeated_failure"
    | "blocked_check"
    | "skipped_check"
    | "missing_configured_command",
  checkId: string,
  status: string,
  runIds: readonly string[],
  count: number
) {
  return {
    kind,
    severity: kind === "failed_check" ? "error" : kind === "skipped_check" ? "info" : "warning",
    checkId,
    runIds,
    command: `pnpm ${checkId}`,
    status,
    count,
    summary: `${checkId} ${status}`
  } as const;
}

function baseContext(): DiagnosticRuleContext {
  return {
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
  };
}
