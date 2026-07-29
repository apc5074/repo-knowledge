import { describe, expect, it } from "vitest";

import { applicationsSchema, validateRepositoryContract } from "../src/index.js";

describe("application schema", () => {
  it("represents multiple runnable applications", () => {
    expect(
      applicationsSchema.parse({
        api: {
          id: "api",
          name: "API",
          type: "api",
          working_directory: "apps/api",
          entrypoint: "src/server.ts",
          dev: {
            command: "pnpm --filter api dev",
            working_directory: "."
          },
          health_check: {
            url: "http://localhost:8080/health"
          },
          ports: [8080],
          environment: ["DATABASE_URL"],
          evidence: [
            {
              kind: "config",
              source_path: "package.json",
              verification_status: "detected"
            }
          ]
        },
        worker: {
          id: "worker",
          type: "worker",
          depends_on: ["api"],
          dev: {
            command: "pnpm --filter worker dev"
          }
        },
        cli: {
          id: "cli",
          type: "cli",
          build: {
            command: "pnpm --filter cli build"
          }
        }
      })
    ).toEqual({
      api: {
        id: "api",
        name: "API",
        type: "api",
        working_directory: "apps/api",
        entrypoint: "src/server.ts",
        dev: {
          command: "pnpm --filter api dev",
          working_directory: ".",
          environment: [],
          requires: [],
          optional: false,
          evidence: []
        },
        health_check: {
          url: "http://localhost:8080/health",
          evidence: []
        },
        ports: [8080],
        depends_on: [],
        environment: ["DATABASE_URL"],
        evidence: [
          {
            kind: "config",
            source_path: "package.json",
            verification_status: "detected"
          }
        ]
      },
      worker: {
        id: "worker",
        type: "worker",
        working_directory: ".",
        depends_on: ["api"],
        dev: {
          command: "pnpm --filter worker dev",
          environment: [],
          requires: [],
          optional: false,
          evidence: []
        },
        ports: [],
        environment: [],
        evidence: []
      },
      cli: {
        id: "cli",
        type: "cli",
        working_directory: ".",
        build: {
          command: "pnpm --filter cli build",
          environment: [],
          requires: [],
          optional: false,
          evidence: []
        },
        ports: [],
        depends_on: [],
        environment: [],
        evidence: []
      }
    });
  });

  it("allows frontend and job style applications", () => {
    const parsed = applicationsSchema.parse({
      frontend: {
        id: "frontend",
        type: "frontend",
        ports: [3000],
        dev: {
          command: "pnpm dev"
        }
      },
      nightly_job: {
        id: "nightly_job",
        type: "job",
        start: {
          command: "python jobs/nightly.py"
        }
      }
    });

    expect(parsed.frontend?.type).toBe("frontend");
    expect(parsed.nightly_job?.type).toBe("job");
  });

  it("detects dependency references that do not exist", () => {
    const result = validateRepositoryContract({
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
    expect(result.issues).toEqual([
      {
        path: "applications.worker.depends_on",
        message: "Unknown application or service dependency: postgres"
      }
    ]);
  });

  it("allows application dependencies to reference services inside the contract", () => {
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
          depends_on: ["postgres"]
        }
      },
      services: {
        postgres: {
          id: "postgres",
          type: "postgresql",
          compose_service: "postgres"
        }
      }
    });

    expect(result.ok).toBe(true);
  });

  it("requires application IDs to match map keys", () => {
    const result = applicationsSchema.safeParse({
      api: {
        id: "backend",
        type: "api"
      }
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: ["api", "id"],
        message: "application id must match its applications map key"
      }
    ]);
  });

  it("validates applications inside the contract object", () => {
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
      }
    });

    expect(result.ok).toBe(true);
  });
});
