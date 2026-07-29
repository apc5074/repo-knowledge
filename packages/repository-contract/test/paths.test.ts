import { describe, expect, it } from "vitest";

import {
  generatedPathSchema,
  sensitivePathSchema,
  sourceOfTruthPathSchema,
  unsafePathSchema,
  validateRepositoryContract
} from "../src/index.js";

describe("path rule schemas", () => {
  it("represents generated files with regeneration commands and source paths", () => {
    expect(
      generatedPathSchema.parse({
        pattern: "src/generated/**",
        description: "Generated API client output.",
        generated_by: {
          command: "pnpm",
          args: ["generate:api"]
        },
        source_paths: ["openapi.yaml"]
      })
    ).toEqual({
      pattern: "src/generated/**",
      description: "Generated API client output.",
      generated_by: {
        command: "pnpm",
        args: ["generate:api"],
        environment: [],
        requires: [],
        optional: false,
        evidence: []
      },
      source_paths: ["openapi.yaml"],
      evidence: []
    });
  });

  it("represents sensitive paths without storing secret values", () => {
    expect(
      sensitivePathSchema.parse({
        pattern: ".env*",
        risk: "May contain local credentials.",
        handling: "Do not quote values in generated contract evidence."
      })
    ).toEqual({
      pattern: ".env*",
      risk: "May contain local credentials.",
      handling: "Do not quote values in generated contract evidence.",
      evidence: []
    });
  });

  it("represents unsafe paths and source-of-truth paths", () => {
    expect(
      unsafePathSchema.parse({
        pattern: "pnpm-lock.yaml",
        reason: "Mechanical dependency lockfile.",
        edit_instead: "package.json"
      })
    ).toEqual({
      pattern: "pnpm-lock.yaml",
      reason: "Mechanical dependency lockfile.",
      edit_instead: "package.json",
      evidence: []
    });

    expect(
      sourceOfTruthPathSchema.parse({
        pattern: "openapi.yaml",
        description: "Canonical API schema.",
        governs: ["src/generated/**", "docs/api.md"]
      })
    ).toEqual({
      pattern: "openapi.yaml",
      description: "Canonical API schema.",
      governs: ["src/generated/**", "docs/api.md"],
      evidence: []
    });
  });

  it("detects empty and absolute path patterns", () => {
    const emptyResult = generatedPathSchema.safeParse({
      pattern: "",
      source_paths: ["openapi.yaml"]
    });

    expect(emptyResult.success).toBe(false);

    const absoluteResult = sensitivePathSchema.safeParse({
      pattern: "/etc/secrets",
      risk: "Outside the repository."
    });

    expect(absoluteResult.success).toBe(false);
    expect(absoluteResult.error?.issues).toEqual([
      {
        code: "custom",
        path: ["pattern"],
        message: "path pattern must be relative to the repository root"
      }
    ]);
  });

  it("validates path models inside the contract object", () => {
    const result = validateRepositoryContract({
      version: 1,
      repository: {
        name: "orders-service",
        type: "service",
        primary_language: "typescript"
      },
      generated_files: [
        {
          pattern: "src/generated/**",
          generated_by: {
            command: "pnpm",
            args: ["generate"]
          }
        }
      ],
      sensitive_paths: [
        {
          pattern: ".env*",
          risk: "May contain local credentials."
        }
      ],
      unsafe_paths: [
        {
          pattern: "src/generated/**",
          reason: "Generated code.",
          edit_instead: "openapi.yaml"
        }
      ],
      source_of_truth_paths: [
        {
          pattern: "openapi.yaml",
          governs: ["src/generated/**"]
        }
      ]
    });

    expect(result.ok).toBe(true);
  });
});
