import { describe, expect, it } from "vitest";

import {
  createDiagnosticFinding,
  runDiagnosticRules,
  type DiagnosticRule,
  type DiagnosticRuleContext
} from "../src/index.js";

describe("diagnostic rule interface", () => {
  it("runs registered rules by category and returns findings plus warnings", () => {
    const context = fakeContext();
    const rule: DiagnosticRule = {
      id: "environment.node.missing",
      category: "environment",
      description: "Detect missing node.",
      prerequisites: ["contract", "local-environment"],
      run: () => ({
        findings: [
          createDiagnosticFinding({
            id: "finding-node-missing",
            ruleId: "environment.node.missing",
            category: "environment",
            severity: "blocking",
            confidence: "confirmed",
            title: "Node.js is missing",
            summary: "Node.js was not found.",
            evidence: [
              {
                kind: "command",
                summary: "node --version failed",
                command: "node --version"
              }
            ],
            suggestedNextSteps: ["Install Node.js."]
          })
        ],
        warnings: [
          {
            ruleId: "environment.node.missing",
            message: "Used cached environment inspection."
          }
        ]
      })
    };
    const ignoredRule: DiagnosticRule = {
      id: "docker.unavailable",
      category: "docker",
      description: "Ignored by category filter.",
      prerequisites: [],
      run: () => ({
        findings: [
          createDiagnosticFinding({
            id: "finding-docker",
            ruleId: "docker.unavailable",
            category: "docker",
            severity: "error",
            confidence: "confirmed",
            title: "Docker unavailable",
            summary: "Docker unavailable."
          })
        ],
        warnings: []
      })
    };

    const result = runDiagnosticRules({
      rules: [rule, ignoredRule],
      context,
      categories: ["environment"]
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        id: "finding-node-missing",
        ruleId: "environment.node.missing",
        category: "environment",
        severity: "blocking",
        confidence: "confirmed",
        kind: "direct_local_fact"
      })
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([
      {
        ruleId: "environment.node.missing",
        message: "Used cached environment inspection."
      }
    ]);
  });

  it("skips rules with missing prerequisites", () => {
    const result = runDiagnosticRules({
      rules: [
        {
          id: "verification.failed",
          category: "verification",
          description: "Requires verification history.",
          prerequisites: ["verification"],
          run: () => ({
            findings: [],
            warnings: []
          })
        }
      ],
      context: fakeContext()
    });

    expect(result).toEqual({
      findings: [],
      skipped: [
        {
          ruleId: "verification.failed",
          reason: "Missing prerequisite: verification"
        }
      ],
      warnings: []
    });
  });

  it("marks findings with counter-evidence as inferred candidates", () => {
    expect(
      createDiagnosticFinding({
        id: "candidate",
        ruleId: "rule",
        category: "contract",
        severity: "warning",
        confidence: "medium",
        title: "Potential stale reference",
        summary: "Reference may be stale.",
        counterEvidence: [
          {
            kind: "file",
            summary: "Path is still imported elsewhere."
          }
        ]
      })
    ).toMatchObject({
      kind: "inferred_candidate",
      counterEvidence: [
        {
          kind: "file",
          summary: "Path is still imported elsewhere."
        }
      ]
    });
  });
});

function fakeContext(): DiagnosticRuleContext {
  return {
    repository: {
      repositoryRoot: "/repo",
      contractPath: "/repo/.board/repository.yaml",
      contractVersion: 1,
      contract: {
        version: 1,
        repository: {
          name: "fake",
          type: "service",
          primary_language: "typescript"
        }
      },
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
    localEnvironment: {
      tools: [],
      environment: [],
      expectedFiles: [],
      warnings: []
    }
  };
}
