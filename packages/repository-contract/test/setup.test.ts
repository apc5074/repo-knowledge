import { describe, expect, it } from "vitest";

import { setupSchema, validateRepositoryContract } from "../src/index.js";

describe("setup schema", () => {
  it("represents common install, migrate, and seed workflow fields", () => {
    expect(
      setupSchema.parse({
        install: {
          command: "pnpm",
          args: ["install"]
        },
        migrate: {
          command: "pnpm",
          args: ["db:migrate"]
        },
        seed: {
          command: "pnpm",
          args: ["db:seed"],
          optional: true,
          optional_reason: "Only needed for local demo data."
        }
      })
    ).toEqual({
      install: {
        command: "pnpm",
        args: ["install"],
        environment: [],
        requires: [],
        optional: false,
        evidence: []
      },
      migrate: {
        command: "pnpm",
        args: ["db:migrate"],
        environment: [],
        requires: [],
        optional: false,
        evidence: []
      },
      seed: {
        command: "pnpm",
        args: ["db:seed"],
        environment: [],
        requires: [],
        optional: true,
        optional_reason: "Only needed for local demo data.",
        evidence: []
      },
      steps: []
    });
  });

  it("represents ordered setup steps with dependencies", () => {
    expect(
      setupSchema
        .parse({
          steps: [
            {
              id: "install",
              kind: "install_dependencies",
              command: {
                command: "pnpm",
                args: ["install"]
              }
            },
            {
              id: "migrate",
              kind: "run_migrations",
              depends_on: ["install"],
              command: {
                command: "pnpm",
                args: ["db:migrate"]
              }
            },
            {
              id: "smoke",
              kind: "smoke_check",
              depends_on: ["migrate"],
              command: {
                command: "pnpm",
                args: ["test:smoke"]
              }
            }
          ]
        })
        .steps?.map((step) => ({
          id: step.id,
          kind: step.kind,
          depends_on: step.depends_on
        }))
    ).toEqual([
      {
        id: "install",
        kind: "install_dependencies",
        depends_on: []
      },
      {
        id: "migrate",
        kind: "run_migrations",
        depends_on: ["install"]
      },
      {
        id: "smoke",
        kind: "smoke_check",
        depends_on: ["migrate"]
      }
    ]);
  });

  it("requires optional setup steps to provide a reason", () => {
    const result = setupSchema.safeParse({
      steps: [
        {
          id: "seed",
          kind: "seed_data",
          optional: true,
          command: {
            command: "pnpm db:seed"
          }
        }
      ]
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: ["steps", 0, "optional_reason"],
        message: "optional_reason is required when a setup step is optional"
      }
    ]);
  });

  it("detects unknown setup step dependencies", () => {
    const result = setupSchema.safeParse({
      steps: [
        {
          id: "migrate",
          kind: "run_migrations",
          depends_on: ["install"],
          command: {
            command: "pnpm db:migrate"
          }
        }
      ]
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: ["steps", 0, "depends_on"],
        message: "Unknown setup step dependency: install"
      }
    ]);
  });

  it("validates setup inside the contract object", () => {
    const result = validateRepositoryContract({
      version: 1,
      repository: {
        name: "orders-service",
        type: "service",
        primary_language: "typescript"
      },
      setup: {
        install: {
          command: "pnpm",
          args: ["install"]
        }
      }
    });

    expect(result.ok).toBe(true);
  });
});
