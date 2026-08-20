import { parseRepositoryContractObject } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import {
  buildBootstrapPlan,
  checkRuntimePorts,
  collectExpectedRuntimePorts
} from "../src/index.js";

describe("runtime port tracking", () => {
  it("collects expected service and application ports from the runtime plan", () => {
    const plan = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contract: parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "ports-fixture",
          type: "service",
          primary_language: "typescript"
        },
        services: {
          postgres: {
            id: "postgres",
            type: "postgresql",
            ports: [5432]
          }
        },
        applications: {
          api: {
            id: "api",
            type: "api",
            ports: [3000]
          }
        }
      })
    }).plan;

    expect(collectExpectedRuntimePorts(plan)).toEqual([
      {
        id: "application-port-api-3000",
        port: 3000,
        host: "127.0.0.1",
        ownerId: "api"
      },
      {
        id: "service-port-postgres-5432",
        port: 5432,
        host: "127.0.0.1",
        ownerId: "postgres"
      }
    ]);
  });

  it("reports free and occupied ports before startup", async () => {
    const plan = portPlan([3000, 5432]);

    await expect(
      checkRuntimePorts({
        plan,
        mode: "availability",
        checkPort: async (port) => (port.port === 3000 ? "occupied" : "available")
      })
    ).resolves.toEqual([
      expect.objectContaining({
        port: 3000,
        mode: "availability",
        status: "occupied",
        summary: "api port 3000 is occupied before startup."
      }),
      expect.objectContaining({
        port: 5432,
        mode: "availability",
        status: "available",
        summary: "api port 5432 is available before startup."
      })
    ]);
  });

  it("reports listening and closed ports after startup", async () => {
    const plan = portPlan([3000, 5432]);

    await expect(
      checkRuntimePorts({
        plan,
        mode: "listening",
        checkPort: async (port) => (port.port === 3000 ? "listening" : "closed")
      })
    ).resolves.toEqual([
      expect.objectContaining({
        port: 3000,
        mode: "listening",
        status: "listening",
        summary: "api port 3000 is listening."
      }),
      expect.objectContaining({
        port: 5432,
        mode: "listening",
        status: "closed",
        summary: "api port 5432 is closed after startup."
      })
    ]);
  });
});

function portPlan(ports: readonly number[]) {
  return buildBootstrapPlan({
    repositoryRoot: "/repo",
    contract: parseRepositoryContractObject({
      version: 1,
      repository: {
        name: "dynamic-port-fixture",
        type: "service",
        primary_language: "typescript"
      },
      applications: {
        api: {
          id: "api",
          type: "api",
          ports: [...ports]
        }
      }
    })
  }).plan;
}
