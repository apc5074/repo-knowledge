import { describe, expect, it } from "vitest";

import { validateRepositoryContract, verificationSchema } from "../src/index.js";

describe("verification schema", () => {
  it("represents default verification checks with shared command steps", () => {
    expect(
      verificationSchema.parse({
        default: [
          {
            id: "typecheck",
            kind: "typecheck",
            command: {
              command: "pnpm",
              args: ["typecheck"],
              timeout_seconds: 120
            },
            success_condition: "Command exits with status 0."
          }
        ]
      })
    ).toEqual({
      default: [
        {
          id: "typecheck",
          kind: "typecheck",
          command: {
            command: "pnpm",
            args: ["typecheck"],
            timeout_seconds: 120,
            environment: [],
            requires: [],
            optional: false,
            evidence: []
          },
          paths: [],
          components: [],
          success_condition: "Command exits with status 0.",
          evidence: []
        }
      ],
      rules: []
    });
  });

  it("represents path-specific rules with commands", () => {
    const parsed = verificationSchema.parse({
      rules: [
        {
          id: "api_changes",
          paths: ["src/api/**", "src/schemas/**"],
          commands: [
            {
              id: "integration",
              command: "pnpm",
              args: ["test:integration"]
            }
          ]
        }
      ]
    });

    expect(parsed.rules?.[0]?.paths).toEqual(["src/api/**", "src/schemas/**"]);
    expect(parsed.rules?.[0]?.commands?.[0]).toMatchObject({
      id: "integration",
      command: "pnpm",
      args: ["test:integration"]
    });
  });

  it("supports component-specific API and smoke checks", () => {
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
          type: "api"
        }
      },
      verification: {
        rules: [
          {
            id: "api_component",
            components: ["api"],
            checks: [
              {
                id: "schema",
                kind: "schema",
                command: {
                  command: "pnpm",
                  args: ["test:schema"]
                }
              },
              {
                id: "smoke",
                kind: "smoke",
                command: {
                  command: "pnpm",
                  args: ["test:smoke"]
                },
                components: ["api"]
              }
            ]
          }
        ]
      }
    });

    expect(result.ok).toBe(true);
  });

  it("requires verification rules to declare a trigger and work to run", () => {
    const result = verificationSchema.safeParse({
      rules: [
        {
          id: "empty"
        }
      ]
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "verification rule requires paths or components",
      "verification rule requires checks or commands"
    ]);
  });

  it("detects unknown component references inside contract verification rules", () => {
    const result = validateRepositoryContract({
      version: 1,
      repository: {
        name: "orders-service",
        type: "service",
        primary_language: "typescript"
      },
      verification: {
        rules: [
          {
            id: "api_component",
            components: ["api"],
            commands: [
              {
                command: "pnpm",
                args: ["test:api"]
              }
            ]
          }
        ]
      }
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      {
        path: "verification.rules.0.components",
        message: "Unknown verification component: api"
      }
    ]);
  });
});
