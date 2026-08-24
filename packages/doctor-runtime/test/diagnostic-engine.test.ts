import { describe, expect, it } from "vitest";

import {
  createDiagnosticFinding,
  runDiagnosticEngine,
  type DiagnosticInspector,
  type DiagnosticRule,
  type DoctorRepositoryContext
} from "../src/index.js";

describe("diagnostic engine", () => {
  it("runs inspectors and rules into a typed doctor run", async () => {
    const result = await runDiagnosticEngine({
      repository: repository(),
      rules: [environmentRule],
      inspectors: [environmentInspector],
      runId: "doctor-1",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z"
    });

    expect(result.run).toMatchObject({
      schemaVersion: 1,
      runId: "doctor-1",
      repositoryRoot: "/repo",
      categories: ["environment"],
      summary: {
        totalFindings: 1,
        bySeverity: {
          blocking: 1
        },
        byCategory: {
          environment: 1
        }
      }
    });
    expect(result.run.findings).toEqual([expect.objectContaining({ id: "finding-node" })]);
  });

  it("applies category filters", async () => {
    const result = await runDiagnosticEngine({
      repository: repository(),
      rules: [environmentRule, dockerRule],
      inspectors: [environmentInspector],
      categories: ["docker"],
      runId: "doctor-filter"
    });

    expect(result.run.findings).toEqual([]);
    expect(result.run.categories).toEqual(["docker"]);
    expect(result.run.warnings).toContain("Rule docker.fake skipped: Missing prerequisite: docker");
  });

  it("preserves partial results when inspectors fail or are disabled", async () => {
    const result = await runDiagnosticEngine({
      repository: repository(),
      rules: [environmentRule],
      inspectors: [
        {
          name: "runtime",
          run: async () => {
            throw new Error("state corrupt");
          }
        },
        environmentInspector
      ],
      disabledInspectors: ["local-environment"],
      runId: "doctor-partial"
    });

    expect(result.run.findings).toEqual([]);
    expect(result.skippedInspectors).toEqual([
      {
        name: "local-environment",
        reason: "disabled"
      }
    ]);
    expect(result.run.warnings).toContain("Inspector runtime failed: state corrupt");
    expect(result.run.warnings).toContain(
      "Rule environment.fake skipped: Missing prerequisite: local-environment"
    );
  });

  it("supports dry runs without running inspectors or rules", async () => {
    const result = await runDiagnosticEngine({
      repository: repository(),
      rules: [environmentRule],
      inspectors: [
        {
          name: "local-environment",
          run: async () => {
            throw new Error("should not run");
          }
        }
      ],
      dryRun: true,
      runId: "doctor-dry"
    });

    expect(result.run.findings).toEqual([]);
    expect(result.skippedInspectors).toEqual([
      {
        name: "local-environment",
        reason: "dry-run"
      }
    ]);
  });
});

const environmentInspector: DiagnosticInspector = {
  name: "local-environment",
  run: async () => ({
    context: {
      localEnvironment: {
        tools: [],
        environment: [],
        expectedFiles: [],
        warnings: []
      }
    }
  })
};

const environmentRule: DiagnosticRule = {
  id: "environment.fake",
  category: "environment",
  description: "Fake environment rule.",
  prerequisites: ["local-environment"],
  run: () => ({
    findings: [
      createDiagnosticFinding({
        id: "finding-node",
        ruleId: "environment.fake",
        category: "environment",
        severity: "blocking",
        confidence: "confirmed",
        title: "Node missing",
        summary: "Node missing."
      })
    ],
    warnings: []
  })
};

const dockerRule: DiagnosticRule = {
  id: "docker.fake",
  category: "docker",
  description: "Fake docker rule.",
  prerequisites: ["docker"],
  run: () => ({
    findings: [],
    warnings: []
  })
};

function repository(): DoctorRepositoryContext {
  return {
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
  };
}
