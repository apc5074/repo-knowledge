import { describe, expect, it } from "vitest";

import { createContractReferenceDiagnosticRules, runDiagnosticRules } from "../src/index.js";
import type { DiagnosticRuleContext } from "../src/index.js";

describe("contract and stale reference diagnostic rules", () => {
  it("exposes contract loader findings", () => {
    const result = runDiagnosticRules({
      rules: createContractReferenceDiagnosticRules(),
      context: {
        ...baseContext(),
        repository: {
          ...baseContext().repository,
          findings: [
            {
              id: "contract.missing",
              ruleId: "contract.missing",
              category: "contract",
              kind: "direct_local_fact",
              severity: "blocking",
              confidence: "confirmed",
              status: "open",
              title: "Board repository contract is missing",
              summary: "Missing.",
              evidence: [],
              counterEvidence: [],
              suggestedNextSteps: [],
              matchedKnownProblemIds: []
            }
          ]
        }
      }
    });

    expect(result.findings).toEqual([expect.objectContaining({ id: "contract.missing" })]);
  });

  it("reports missing contract paths and commands while preserving active references", () => {
    const result = runDiagnosticRules({
      rules: createContractReferenceDiagnosticRules(),
      context: {
        ...contextWithContract(),
        repositoryInventory: {
          paths: ["openapi.yaml", "src/generated/api.ts"],
          commands: ["pnpm"]
        }
      }
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        id: "contract.path.generated_files.src-missing.missing",
        title: "Contract references a missing path"
      }),
      expect.objectContaining({
        id: "contract.command.setup-migrate.legacy-migrate.missing",
        title: "Contract references a missing command"
      })
    ]);
    expect(JSON.stringify(result.findings)).not.toContain("openapi.yaml, but no matching");
  });

  it("reports stale documentation and agent-instruction references", () => {
    const result = runDiagnosticRules({
      rules: createContractReferenceDiagnosticRules(),
      context: {
        ...baseContext(),
        repositoryInventory: {
          paths: ["src/app.ts"],
          commands: ["pnpm"],
          documentationReferences: [
            { sourcePath: "README.md", kind: "path", value: "src/missing.ts", line: 12 },
            { sourcePath: "README.md", kind: "command", value: "pnpm", line: 13 }
          ],
          agentInstructionReferences: [
            { sourcePath: "AGENTS.md", kind: "command", value: "old-test", line: 2 }
          ]
        }
      }
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        id: "docs.reference.README-md.src-missing-ts.missing",
        title: "Documentation references a missing item"
      }),
      expect.objectContaining({
        id: "docs.reference.AGENTS-md.old-test.missing",
        title: "Documentation references a missing item"
      })
    ]);
  });
});

function contextWithContract(): DiagnosticRuleContext {
  return {
    ...baseContext(),
    repository: {
      ...baseContext().repository,
      contract: {
        version: 1,
        repository: {
          name: "contract-fixture",
          type: "service",
          primary_language: "typescript"
        },
        setup: {
          install: {
            command: "pnpm",
            args: ["install"]
          },
          migrate: {
            command: "legacy-migrate",
            args: []
          }
        },
        generated_files: [
          {
            pattern: "src/generated/**",
            source_paths: ["openapi.yaml"],
            generated_by: {
              command: "pnpm",
              args: ["generate"]
            }
          },
          {
            pattern: "src/missing/**"
          }
        ]
      }
    }
  };
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
