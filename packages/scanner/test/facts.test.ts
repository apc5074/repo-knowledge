import { describe, expect, it } from "vitest";

import {
  createScannerEvidence,
  createScannerFact,
  getScannerFactDefinition,
  isScannerFactKind,
  scannerFactDefinitions,
  scannerFactKinds,
  type FutureMaintenanceAgent,
  type ScannerFactKind
} from "../src/index.js";

const expectedFactKinds = [
  "language.detected",
  "package_manager.detected",
  "framework.detected",
  "application.detected",
  "service.detected",
  "entrypoint.detected",
  "command.detected",
  "dockerfile.detected",
  "compose.file_detected",
  "compose.service_detected",
  "devcontainer.detected",
  "environment.variable_detected",
  "database.dependency_detected",
  "cache.dependency_detected",
  "migration.directory_detected",
  "seed.directory_detected",
  "api.route_file_detected",
  "worker.detected",
  "generated.path_detected",
  "documentation.detected",
  "agent_instruction.detected",
  "repo_skill.detected",
  "legacy.marker_detected",
  "legacy.path_candidate_detected",
  "legacy.symbol_candidate_detected",
  "legacy.command_candidate_detected",
  "legacy.route_candidate_detected",
  "legacy.replacement_detected",
  "ci.workflow_detected"
] satisfies readonly ScannerFactKind[];

describe("scanner fact taxonomy", () => {
  it("defines the original MVP scanner fact kinds", () => {
    expect(scannerFactKinds).toEqual(expectedFactKinds);
    expect(new Set(scannerFactKinds).size).toBe(scannerFactKinds.length);
  });

  it("documents shape, evidence, confidence, and agent consumers for every fact kind", () => {
    expect(scannerFactDefinitions.map((definition) => definition.kind)).toEqual(scannerFactKinds);

    for (const definition of scannerFactDefinitions) {
      expect(definition.description.length).toBeGreaterThan(0);
      expect(definition.valueShape).toContain("{");
      expect(definition.evidenceKinds.length).toBeGreaterThan(0);
      expect(definition.confidenceGuidance.length).toBeGreaterThan(0);
      expect(definition.consumedBy).toContain("scanner");
    }
  });

  it("distinguishes application, service, command, and dependency facts", () => {
    expect(getScannerFactDefinition("application.detected").valueShape).toContain("path");
    expect(getScannerFactDefinition("service.detected").valueShape).toContain("kind");
    expect(getScannerFactDefinition("command.detected").valueShape).toContain("command");
    expect(getScannerFactDefinition("database.dependency_detected").description).toContain(
      "Database dependency"
    );
    expect(getScannerFactDefinition("cache.dependency_detected").description).toContain("Cache");
  });

  it("routes facts to the future maintenance agents from the plan", () => {
    const expectedAgents = new Set<FutureMaintenanceAgent>([
      "scanner",
      "contract",
      "drift",
      "documentation",
      "skill",
      "legacy",
      "context",
      "verification"
    ]);
    const actualAgents = new Set(
      scannerFactDefinitions.flatMap((definition) => definition.consumedBy)
    );

    for (const agent of expectedAgents) {
      expect(actualAgents.has(agent)).toBe(true);
    }
  });

  it("creates deterministic evidence-backed scanner facts", () => {
    const evidence = createScannerEvidence({
      kind: "config",
      sourcePath: "package.json",
      detector: "package-manager",
      lineStart: 2
    });
    const input = {
      kind: "package_manager.detected" as const,
      value: {
        name: "pnpm",
        primary: true
      },
      confidence: "high" as const,
      detector: "package-manager",
      evidence: [evidence]
    };
    const first = createScannerFact(input);
    const second = createScannerFact(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      kind: "package_manager.detected",
      source: "deterministic",
      detector: "package-manager",
      confidence: "high",
      evidence: [evidence]
    });
    expect(first.id).toHaveLength(24);
  });

  it("rejects detector-less or evidence-less facts", () => {
    const evidence = createScannerEvidence({
      kind: "config",
      sourcePath: "package.json",
      detector: "package-manager"
    });

    expect(isScannerFactKind("language.detected")).toBe(true);
    expect(isScannerFactKind("made.up")).toBe(false);
    expect(() =>
      createScannerFact({
        kind: "package_manager.detected",
        value: {
          name: "pnpm"
        },
        confidence: "high",
        detector: " ",
        evidence: [evidence]
      })
    ).toThrow("detector");
    expect(() =>
      createScannerFact({
        kind: "package_manager.detected",
        value: {
          name: "pnpm"
        },
        confidence: "high",
        detector: "package-manager",
        evidence: []
      })
    ).toThrow("evidence");
  });
});
