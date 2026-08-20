import { parseRepositoryContractObject } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import { buildBootstrapPlan } from "../src/index.js";

describe("bootstrap runtime plan builder", () => {
  it("builds an executable dry-run plan from setup, services, applications, and health checks", () => {
    const result = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contractPath: "/repo/.board/repository.yaml",
      contract: fixtureContract()
    });

    expect(result).toMatchObject({
      ok: true,
      status: "pending",
      summary: "Built bootstrap runtime plan from repository contract.",
      plan: {
        dryRun: true,
        resources: expect.arrayContaining([
          expect.objectContaining({ id: "compose-service-postgres", kind: "compose-service" }),
          expect.objectContaining({ id: "application-port-api-3000", kind: "port" }),
          expect.objectContaining({ id: "process-api", kind: "process" }),
          expect.objectContaining({ id: "application-health-api", kind: "health-check" })
        ])
      }
    });
    expect(result.plan.steps.map((step) => step.id)).toEqual([
      "load-contract",
      "inspect-prerequisites",
      "resolve-environment",
      "setup-install",
      "setup-migrate",
      "setup-seed",
      "setup-step-generate-client",
      "setup-step-warm-cache",
      "service-postgres",
      "application-api",
      "application-health-api",
      "record-state"
    ]);
    expect(result.plan.steps.find((step) => step.id === "setup-install")?.command).toMatchObject({
      command: "pnpm",
      args: ["install"],
      cwd: "/repo",
      shell: false,
      environment: []
    });
    expect(result.plan.steps.find((step) => step.id === "setup-step-warm-cache")).toMatchObject({
      dependsOn: ["setup-step-generate-client"],
      optional: true,
      skippedReason: "Cache is optional for local development."
    });
    expect(result.plan.steps.find((step) => step.id === "application-api")).toMatchObject({
      dependsOn: ["service-postgres"],
      command: {
        command: "pnpm",
        args: ["dev"],
        cwd: "/repo/apps/api",
        environment: ["DATABASE_URL"]
      }
    });
  });

  it("can skip setup and suppress health checks", () => {
    const result = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contract: fixtureContract(),
      skipSetup: true,
      healthChecks: false
    });

    expect(result.plan.steps.find((step) => step.id === "setup-install")).toMatchObject({
      optional: true,
      skippedReason: "Setup was skipped by runtime options."
    });
    expect(result.plan.steps.map((step) => step.id)).not.toContain("application-health-api");
  });

  it("limits service and application steps when only one id is requested", () => {
    const result = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contract: fixtureContract(),
      only: "postgres"
    });

    expect(result.plan.steps.map((step) => step.id)).toContain("service-postgres");
    expect(result.plan.steps.map((step) => step.id)).not.toContain("application-api");
    expect(result.plan.resources.map((resource) => resource.id)).toContain(
      "compose-service-postgres"
    );
    expect(result.plan.resources.map((resource) => resource.id)).not.toContain("process-api");
  });

  it("keeps unsupported runtime pieces visible as warnings instead of crashing", () => {
    const result = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contract: parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "warning-fixture",
          type: "service",
          primary_language: "typescript"
        },
        services: {
          redis: {
            id: "redis",
            type: "redis"
          }
        },
        applications: {
          api: {
            id: "api",
            type: "api"
          }
        }
      })
    });

    expect(result.plan.warnings).toEqual([
      "Service redis has no compose_service or image; it will be reported but not started by the MVP runtime.",
      "Application api has no dev or start command; it will be reported but not launched by the MVP runtime."
    ]);
    expect(result.plan.steps.map((step) => step.id)).toEqual(
      expect.arrayContaining(["service-redis", "application-api"])
    );
  });
});

function fixtureContract() {
  return parseRepositoryContractObject({
    version: 1,
    repository: {
      name: "plan-fixture",
      type: "monorepo",
      primary_language: "typescript"
    },
    environment: {
      DATABASE_URL: {
        name: "DATABASE_URL",
        required: true
      }
    },
    setup: {
      seed: {
        command: "pnpm",
        args: ["seed"]
      },
      install: {
        command: "pnpm",
        args: ["install"]
      },
      migrate: {
        command: "pnpm",
        args: ["migrate"]
      },
      steps: [
        {
          id: "generate-client",
          kind: "generate_code",
          command: {
            command: "pnpm",
            args: ["generate"]
          }
        },
        {
          id: "warm-cache",
          kind: "custom",
          depends_on: ["generate-client"],
          optional: true,
          optional_reason: "Cache is optional for local development.",
          command: {
            command: "pnpm",
            args: ["cache:warm"]
          }
        }
      ]
    },
    services: {
      postgres: {
        id: "postgres",
        type: "postgresql",
        compose_service: "postgres",
        ports: [5432]
      }
    },
    applications: {
      api: {
        id: "api",
        type: "api",
        working_directory: "apps/api",
        depends_on: ["postgres"],
        environment: ["DATABASE_URL"],
        ports: [3000],
        dev: {
          command: "pnpm",
          args: ["dev"],
          environment: ["DATABASE_URL"]
        },
        health_check: {
          url: "http://localhost:3000/health"
        }
      }
    }
  });
}
