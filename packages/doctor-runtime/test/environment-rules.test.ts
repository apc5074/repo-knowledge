import { describe, expect, it } from "vitest";

import { createEnvironmentDiagnosticRules, runDiagnosticRules } from "../src/index.js";
import type { DiagnosticRuleContext } from "../src/index.js";

describe("environment diagnostic rules", () => {
  it("creates blocking findings for missing required tools", () => {
    const result = runDiagnosticRules({
      rules: createEnvironmentDiagnosticRules(),
      context: contextWithEnvironment({
        tools: [
          {
            id: "node",
            kind: "node",
            command: "node",
            args: ["--version"],
            required: true,
            status: "missing",
            summary: "node is missing."
          }
        ],
        environment: [],
        expectedFiles: [],
        warnings: []
      })
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        id: "environment.tool.node.missing",
        ruleId: "environment.tools",
        severity: "blocking",
        confidence: "confirmed",
        title: "node is missing"
      })
    ]);
  });

  it("creates actionable findings for unsupported versions", () => {
    const result = runDiagnosticRules({
      rules: createEnvironmentDiagnosticRules(),
      context: contextWithEnvironment({
        tools: [
          {
            id: "node",
            kind: "node",
            command: "node",
            args: ["--version"],
            required: true,
            status: "unsupported",
            parsedVersion: "20.1.0",
            versionRequirement: ">=22.0.0",
            summary: "node is available but unsupported."
          }
        ],
        environment: [],
        expectedFiles: [],
        warnings: []
      })
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        id: "environment.tool.node.unsupported",
        severity: "error",
        confidence: "high",
        summary: "node does not satisfy >=22.0.0."
      })
    ]);
  });

  it("lists missing required environment variable names only", () => {
    const result = runDiagnosticRules({
      rules: createEnvironmentDiagnosticRules(),
      context: contextWithEnvironment({
        tools: [],
        environment: [
          {
            name: "DATABASE_URL",
            status: "missing",
            required: true,
            secret: true,
            usedBy: ["application:api"],
            summary: "DATABASE_URL is missing and required."
          }
        ],
        expectedFiles: [],
        warnings: []
      })
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        id: "environment.variable.DATABASE_URL.missing",
        severity: "blocking",
        summary: "DATABASE_URL is required but is not set."
      })
    ]);
    expect(JSON.stringify(result.findings)).not.toContain("postgres://");
  });

  it("creates warning findings for missing expected files", () => {
    const result = runDiagnosticRules({
      rules: createEnvironmentDiagnosticRules(),
      context: contextWithEnvironment({
        tools: [],
        environment: [],
        expectedFiles: [
          {
            path: "pnpm-lock.yaml",
            status: "missing",
            reason: "package manager lockfile"
          }
        ],
        warnings: []
      })
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        id: "environment.file.pnpm-lock-yaml.missing",
        severity: "warning",
        confidence: "medium"
      })
    ]);
  });
});

function contextWithEnvironment(
  localEnvironment: DiagnosticRuleContext["localEnvironment"]
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
    localEnvironment
  };
}
