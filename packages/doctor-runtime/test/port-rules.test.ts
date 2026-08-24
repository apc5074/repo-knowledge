import { describe, expect, it } from "vitest";

import { createPortDiagnosticRules, runDiagnosticRules } from "../src/index.js";
import type { DiagnosticRuleContext, PortInspection } from "../src/index.js";

describe("port diagnostic rules", () => {
  it("diagnoses occupied expected ports and missing expected listeners", () => {
    const result = runDiagnosticRules({
      rules: createPortDiagnosticRules(),
      context: contextWithPorts({
        expectedPorts: [],
        checks: [],
        warnings: [],
        observations: [
          {
            kind: "occupied_expected_port",
            severity: "error",
            port: 3000,
            host: "127.0.0.1",
            ownerId: "api",
            ownerKind: "unknown",
            summary: "api port 3000 is occupied by an unknown process."
          },
          {
            kind: "missing_expected_listener",
            severity: "error",
            port: 5432,
            host: "127.0.0.1",
            ownerId: "postgres",
            ownerKind: "unknown",
            summary: "postgres port 5432 is not listening."
          }
        ]
      })
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        id: "ports.occupied_expected_port.127.0.0.1-3000.api",
        title: "Expected port is occupied",
        confidence: "medium"
      }),
      expect.objectContaining({
        id: "ports.missing_expected_listener.127.0.0.1-5432.postgres",
        title: "Expected port is not listening"
      })
    ]);
  });

  it("detects duplicate contract port assignments", () => {
    const result = runDiagnosticRules({
      rules: createPortDiagnosticRules(),
      context: contextWithPorts({
        expectedPorts: [
          {
            id: "application-port-api-3000",
            port: 3000,
            host: "127.0.0.1",
            ownerId: "api",
            ownerType: "application"
          },
          {
            id: "application-port-web-3000",
            port: 3000,
            host: "127.0.0.1",
            ownerId: "web",
            ownerType: "application"
          }
        ],
        checks: [],
        observations: [],
        warnings: []
      })
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        id: "ports.contract-duplicate.127.0.0.1-3000",
        severity: "warning",
        confidence: "confirmed",
        summary: "api, web all declare 127.0.0.1:3000."
      })
    ]);
  });

  it("detects stale Board runtime state claiming a port", () => {
    const result = runDiagnosticRules({
      rules: createPortDiagnosticRules(),
      context: {
        ...contextWithPorts({
          expectedPorts: [],
          checks: [
            {
              id: "application-port-api-3000",
              port: 3000,
              host: "127.0.0.1",
              ownerId: "api",
              ownerType: "application",
              status: "occupied",
              ownerKind: "board-managed"
            }
          ],
          observations: [],
          warnings: []
        }),
        runtime: {
          recentSessions: [
            {
              id: "session-stale",
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
                    host: "127.0.0.1",
                    port: 3000
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
          staleSessionIds: ["session-stale"],
          warnings: []
        }
      }
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        id: "ports.stale-board-state.127.0.0.1-3000",
        title: "Stale Board runtime state claims a port"
      })
    ]);
  });

  it("returns no findings when ports have no conflicts", () => {
    const result = runDiagnosticRules({
      rules: createPortDiagnosticRules(),
      context: contextWithPorts({
        expectedPorts: [
          {
            id: "application-port-api-3000",
            port: 3000,
            host: "127.0.0.1",
            ownerId: "api",
            ownerType: "application"
          }
        ],
        checks: [
          {
            id: "application-port-api-3000",
            port: 3000,
            host: "127.0.0.1",
            ownerId: "api",
            ownerType: "application",
            status: "available",
            ownerKind: "unknown"
          }
        ],
        observations: [],
        warnings: []
      })
    });

    expect(result.findings).toEqual([]);
  });
});

function contextWithPorts(ports: PortInspection): DiagnosticRuleContext {
  return {
    repository: {
      repositoryRoot: "/repo",
      contractPath: "/repo/.board/repository.yaml",
      git: { available: false, warnings: [] },
      componentIds: [],
      applicationIds: [],
      serviceIds: [],
      environmentNames: [],
      setupStepIds: [],
      verificationCheckIds: [],
      verificationRuleIds: [],
      generatedPathPatterns: [],
      documentationPathPatterns: [],
      knownLimitationIds: [],
      warnings: [],
      findings: []
    },
    ports
  };
}
