import { describe, expect, it } from "vitest";

import { serviceSchema, servicesSchema, validateRepositoryContract } from "../src/index.js";

describe("service dependency schema", () => {
  it("represents PostgreSQL and Redis as first-class service dependencies", () => {
    expect(
      servicesSchema.parse({
        postgres: {
          id: "postgres",
          name: "PostgreSQL",
          type: "postgresql",
          compose_service: "db",
          image: "postgres:16",
          ports: [5432],
          health_check: {
            command: {
              command: "pg_isready -h localhost -p 5432"
            }
          },
          environment: ["DATABASE_URL"],
          volumes: ["postgres-data:/var/lib/postgresql/data"],
          evidence: [
            {
              kind: "config",
              source_path: "docker-compose.yml",
              verification_status: "detected"
            }
          ]
        },
        redis: {
          id: "redis",
          type: "redis",
          compose_service: "redis",
          ports: [6379]
        }
      })
    ).toEqual({
      postgres: {
        id: "postgres",
        name: "PostgreSQL",
        type: "postgresql",
        compose_service: "db",
        image: "postgres:16",
        ports: [5432],
        health_check: {
          command: {
            command: "pg_isready -h localhost -p 5432",
            environment: [],
            requires: [],
            optional: false,
            evidence: []
          },
          evidence: []
        },
        required: true,
        environment: ["DATABASE_URL"],
        volumes: ["postgres-data:/var/lib/postgresql/data"],
        evidence: [
          {
            kind: "config",
            source_path: "docker-compose.yml",
            verification_status: "detected"
          }
        ]
      },
      redis: {
        id: "redis",
        type: "redis",
        compose_service: "redis",
        ports: [6379],
        required: true,
        environment: [],
        volumes: [],
        evidence: []
      }
    });
  });

  it("requires optional services to explain degraded behavior", () => {
    const result = serviceSchema.safeParse({
      id: "s3",
      type: "object_storage",
      required: false
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: ["optional_reason"],
        message: "optional_reason is required when a service is not required"
      }
    ]);
  });

  it("rejects invalid ports and service types", () => {
    const result = serviceSchema.safeParse({
      id: "postgres",
      type: "database",
      ports: [70000]
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual(["type", "ports.0"]);
  });

  it("validates services inside the contract object", () => {
    const result = validateRepositoryContract({
      version: 1,
      repository: {
        name: "orders-service",
        type: "service",
        primary_language: "typescript"
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
});
