import { parseRepositoryContractObject } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import { buildBootstrapPlan, resolveRuntimeEnvironment } from "../src/index.js";

describe("runtime environment resolution", () => {
  it("reports required missing variables and affected steps without storing values", () => {
    const contract = parseRepositoryContractObject({
      version: 1,
      repository: {
        name: "environment-fixture",
        type: "service",
        primary_language: "typescript"
      },
      environment: {
        DATABASE_URL: {
          name: "DATABASE_URL",
          required: true,
          secret: true
        },
        OPTIONAL_CACHE_URL: {
          name: "OPTIONAL_CACHE_URL",
          required: false
        }
      },
      setup: {
        migrate: {
          command: "pnpm",
          args: ["migrate"],
          environment: ["DATABASE_URL"]
        }
      },
      applications: {
        api: {
          id: "api",
          type: "api",
          environment: ["DATABASE_URL", "OPTIONAL_CACHE_URL"],
          dev: {
            command: "pnpm",
            args: ["dev"],
            environment: ["DATABASE_URL"]
          }
        }
      }
    });
    const plan = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contract
    }).plan;
    const result = resolveRuntimeEnvironment({
      contract,
      plan,
      env: {
        OPTIONAL_CACHE_URL: "redis://localhost:6379"
      }
    });

    expect(result).toMatchObject({
      missingRequiredNames: ["DATABASE_URL"],
      missingOptionalNames: [],
      blockedStepIds: ["application-api", "setup-migrate"],
      errors: ["DATABASE_URL is required for local runtime and is not set."]
    });
    expect(result.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "DATABASE_URL",
          status: "missing",
          required: true,
          secret: true,
          usedByStepIds: ["application-api", "setup-migrate"]
        }),
        expect.objectContaining({
          name: "OPTIONAL_CACHE_URL",
          status: "present",
          required: false
        })
      ])
    );
    expect(JSON.stringify(result.variables)).not.toContain("redis://localhost:6379");
    expect(result.values).toEqual({
      OPTIONAL_CACHE_URL: "redis://localhost:6379"
    });
  });

  it("distinguishes optional missing variables", () => {
    const contract = parseRepositoryContractObject({
      version: 1,
      repository: {
        name: "optional-fixture",
        type: "service",
        primary_language: "typescript"
      },
      environment: {
        OPTIONAL_API_KEY: {
          name: "OPTIONAL_API_KEY",
          required: false,
          secret: true,
          example_value: "<redacted>"
        }
      }
    });
    const plan = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contract
    }).plan;

    const result = resolveRuntimeEnvironment({
      contract,
      plan,
      env: {}
    });

    expect(result).toMatchObject({
      missingRequiredNames: [],
      missingOptionalNames: ["OPTIONAL_API_KEY"],
      blockedStepIds: [],
      warnings: ["OPTIONAL_API_KEY is optional for local runtime and is not set."],
      values: {}
    });
    expect(result.variables).toEqual([
      expect.objectContaining({
        name: "OPTIONAL_API_KEY",
        secret: true,
        status: "missing",
        required: false
      })
    ]);
  });

  it("uses present selected values for command execution without exposing them in variable reports", () => {
    const contract = parseRepositoryContractObject({
      version: 1,
      repository: {
        name: "present-fixture",
        type: "service",
        primary_language: "typescript"
      },
      setup: {
        install: {
          command: "pnpm",
          args: ["install"],
          environment: ["NPM_TOKEN"]
        }
      }
    });
    const plan = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contract
    }).plan;
    const result = resolveRuntimeEnvironment({
      contract,
      plan,
      env: {
        NPM_TOKEN: "npm-token-secret"
      }
    });

    expect(result.values).toEqual({
      NPM_TOKEN: "npm-token-secret"
    });
    expect(result.variables).toEqual([
      expect.objectContaining({
        name: "NPM_TOKEN",
        status: "present",
        required: true,
        secret: true
      })
    ]);
    expect(JSON.stringify(result.variables)).not.toContain("npm-token-secret");
  });
});
