import { describe, expect, it } from "vitest";

import {
  formatValidationIssuesForHuman,
  formatValidationIssuesForJson,
  validateRepositoryContractDetailed
} from "../src/index.js";

describe("detailed validation error system", () => {
  it("includes path, code, severity, expected values, actual values, and suggestions", () => {
    const result = validateRepositoryContractDetailed({
      version: 1,
      repository: {
        name: "orders-service",
        type: "daemon",
        primary_language: "ruby"
      }
    });

    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      path: "repository.type",
      code: "invalid_value",
      severity: "error",
      expected: '"service" | "application" | "library" | "monorepo" | "tooling" | "unknown"',
      actual: "daemon",
      suggestion: "Use one of the allowed values for repository.type."
    });
  });

  it("suggests fixes for missing cross-reference targets", () => {
    const result = validateRepositoryContractDetailed({
      version: 1,
      repository: {
        name: "orders-service",
        type: "service",
        primary_language: "typescript"
      },
      applications: {
        worker: {
          id: "worker",
          type: "worker",
          depends_on: ["postgres"]
        }
      }
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        path: "applications.worker.depends_on",
        message: "Unknown application or service dependency: postgres",
        code: "custom",
        severity: "error",
        suggestion:
          "Add the referenced id under applications or services, or remove the dependency."
      })
    );
  });

  it("redacts secret-looking environment values from detailed actual output", () => {
    const result = validateRepositoryContractDetailed({
      version: 1,
      repository: {
        name: "orders-service",
        type: "service",
        primary_language: "typescript"
      },
      environment: {
        OPENAI_API_KEY: {
          name: "OPENAI_API_KEY",
          secret: true,
          example_value: "sk-project-1234567890abcdef"
        }
      }
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "environment.OPENAI_API_KEY.example_value",
          actual: "[redacted]",
          suggestion:
            "Store only the variable name or a safe placeholder, never a real secret value."
        })
      ])
    );
    expect(JSON.stringify(result.issues)).not.toContain("sk-project-1234567890abcdef");
  });

  it("formats issues for human and JSON output", () => {
    const result = validateRepositoryContractDetailed({
      version: 1,
      repository: {
        name: "orders-service",
        type: "daemon",
        primary_language: "ruby"
      }
    });

    expect(result.ok).toBe(false);

    expect(formatValidationIssuesForHuman(result.issues)).toContain(
      "ERROR repository.type: Invalid option"
    );
    expect(formatValidationIssuesForJson(result.issues)).toEqual({
      issues: result.issues
    });
  });
});
