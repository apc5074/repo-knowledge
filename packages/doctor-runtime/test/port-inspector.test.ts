import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  collectExpectedPorts,
  inspectPorts,
  loadDoctorRepositoryContext,
  type RuntimeSessionInspection
} from "../src/index.js";

describe("port inspector", () => {
  it("collects expected application and service ports from the contract", async () => {
    const context = await loadContext();

    expect(collectExpectedPorts(context)).toEqual([
      {
        id: "application-port-api-3000",
        port: 3000,
        host: "127.0.0.1",
        ownerId: "api",
        ownerType: "application"
      },
      {
        id: "service-port-postgres-5432",
        port: 5432,
        host: "127.0.0.1",
        ownerId: "postgres",
        ownerType: "service"
      }
    ]);
  });

  it("reports occupied expected ports and distinguishes Board-managed ownership", async () => {
    const context = await loadContext();
    const inspection = await inspectPorts({
      context,
      runtimeInspection: boardManagedRuntimeInspection,
      checkPort: async (port) => ({
        status: port.port === 3000 ? "occupied" : "available"
      })
    });

    expect(inspection.observations).toEqual([
      {
        kind: "occupied_expected_port",
        severity: "warning",
        port: 3000,
        host: "127.0.0.1",
        ownerId: "api",
        ownerKind: "board-managed",
        summary: "api port 3000 is occupied by a Board-managed process."
      }
    ]);
  });

  it("reports unknown occupied ports as likely conflicts", async () => {
    const context = await loadContext();
    const inspection = await inspectPorts({
      context,
      checkPort: async (port) => ({
        status: port.port === 3000 ? "occupied" : "available"
      })
    });

    expect(inspection.observations).toEqual([
      expect.objectContaining({
        kind: "occupied_expected_port",
        severity: "error",
        ownerKind: "unknown"
      })
    ]);
  });

  it("reports missing expected listeners in runtime failure contexts", async () => {
    const context = await loadContext();
    const inspection = await inspectPorts({
      context,
      runtimeInspection: {
        recentSessions: [],
        managedProcesses: [],
        staleSessionIds: [],
        warnings: [],
        observations: [
          {
            kind: "failed_health_check",
            sessionId: "session-failed",
            severity: "error",
            summary: "health failed"
          }
        ]
      },
      checkPort: async () => ({
        status: "closed"
      })
    });

    expect(inspection.observations).toEqual([
      expect.objectContaining({
        kind: "missing_expected_listener",
        port: 3000,
        ownerId: "api"
      }),
      expect.objectContaining({
        kind: "missing_expected_listener",
        port: 5432,
        ownerId: "postgres"
      })
    ]);
  });
});

async function loadContext() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "doctor-ports-"));
  await mkdir(join(repositoryRoot, ".board"), { recursive: true });
  await writeFile(join(repositoryRoot, ".board/repository.yaml"), contractYaml, "utf8");

  return loadDoctorRepositoryContext({
    repositoryRoot,
    runGitCommand: async () => ({
      exitCode: 0,
      stdout: repositoryRoot,
      stderr: ""
    })
  });
}

const boardManagedRuntimeInspection: RuntimeSessionInspection = {
  recentSessions: [
    {
      id: "session-running",
      repositoryRoot: "/repo",
      status: "running",
      startedAt: "2026-01-01T00:00:00.000Z",
      steps: [],
      resources: [
        {
          id: "application-port-api-3000",
          kind: "port",
          status: "running",
          metadata: {
            port: 3000,
            host: "127.0.0.1"
          }
        }
      ],
      commandResults: [],
      healthCheckResults: [],
      warnings: [],
      errors: []
    }
  ],
  managedProcesses: [],
  observations: [],
  staleSessionIds: [],
  warnings: []
};

const contractYaml = `version: 1
repository:
  name: ports-fixture
  type: service
  primary_language: typescript
applications:
  api:
    id: api
    type: api
    ports:
      - 3000
services:
  postgres:
    id: postgres
    type: postgresql
    ports:
      - 5432
`;
