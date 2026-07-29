import { describe, expect, it } from "vitest";

import {
  environmentSchema,
  environmentVariableSchema,
  validateRepositoryContract
} from "../src/index.js";

describe("environment variable schema", () => {
  it("represents required, optional, secret, and local default variables", () => {
    expect(
      environmentSchema.parse({
        DATABASE_URL: {
          name: "DATABASE_URL",
          required: true,
          description: "Connection string for the local PostgreSQL service.",
          used_by: ["api", "postgres"],
          secret: false,
          default_for_local: "postgres://postgres:postgres@localhost:5432/orders",
          source: "human",
          evidence: [
            {
              kind: "config",
              source_path: ".env.example",
              verification_status: "human_confirmed"
            }
          ]
        },
        OPENAI_API_KEY: {
          name: "OPENAI_API_KEY",
          required: false,
          description: "Optional LLM provider key for agent workflows.",
          secret: true,
          example_value: "<redacted>"
        }
      })
    ).toEqual({
      DATABASE_URL: {
        name: "DATABASE_URL",
        required: true,
        description: "Connection string for the local PostgreSQL service.",
        used_by: ["api", "postgres"],
        secret: false,
        default_for_local: "postgres://postgres:postgres@localhost:5432/orders",
        source: "human",
        evidence: [
          {
            kind: "config",
            source_path: ".env.example",
            verification_status: "human_confirmed"
          }
        ]
      },
      OPENAI_API_KEY: {
        name: "OPENAI_API_KEY",
        required: false,
        description: "Optional LLM provider key for agent workflows.",
        used_by: [],
        secret: true,
        example_value: "<redacted>",
        evidence: []
      }
    });
  });

  it("names secret variables without storing secret values", () => {
    const parsed = environmentVariableSchema.parse({
      name: "ANTHROPIC_API_KEY",
      required: true,
      secret: true,
      example_value: "replace-me"
    });

    expect(parsed).toEqual({
      name: "ANTHROPIC_API_KEY",
      required: true,
      used_by: [],
      secret: true,
      example_value: "replace-me",
      evidence: []
    });
  });

  it("rejects default values for secret variables", () => {
    const result = environmentVariableSchema.safeParse({
      name: "OPENAI_API_KEY",
      secret: true,
      default_for_local: "sk-project-real-looking-value"
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: ["default_for_local"],
        message: "secret variables must not store default_for_local values"
      }
    ]);
  });

  it("rejects secret-looking example values", () => {
    const result = environmentVariableSchema.safeParse({
      name: "OPENAI_API_KEY",
      secret: true,
      example_value: "sk-project-1234567890abcdef"
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "secret variables may only use safe placeholder example values",
      "example_value looks like a secret and must not be stored in the contract"
    ]);
  });

  it("requires environment map keys to match variable names", () => {
    const result = environmentSchema.safeParse({
      DATABASE_URL: {
        name: "REDIS_URL"
      }
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: ["DATABASE_URL", "name"],
        message: "environment variable name must match its environment map key"
      }
    ]);
  });

  it("validates application and service environment references inside the contract object", () => {
    const result = validateRepositoryContract({
      version: 1,
      repository: {
        name: "orders-service",
        type: "service",
        primary_language: "typescript"
      },
      applications: {
        api: {
          id: "api",
          type: "api",
          environment: ["DATABASE_URL"]
        }
      },
      services: {
        postgres: {
          id: "postgres",
          type: "postgresql",
          environment: ["DATABASE_URL"]
        }
      },
      environment: {
        DATABASE_URL: {
          name: "DATABASE_URL",
          required: true,
          secret: false
        }
      }
    });

    expect(result.ok).toBe(true);
  });

  it("reports unknown environment variable references", () => {
    const result = validateRepositoryContract({
      version: 1,
      repository: {
        name: "orders-service",
        type: "service",
        primary_language: "typescript"
      },
      applications: {
        api: {
          id: "api",
          type: "api",
          environment: ["DATABASE_URL"]
        }
      }
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      {
        path: "applications.api.environment",
        message: "Unknown environment variable: DATABASE_URL"
      }
    ]);
  });
});
