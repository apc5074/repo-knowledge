import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  normalizeScanResult,
  scanRepository,
  type RepositoryScanResult,
  type ScannerFact
} from "../src/index.js";

const fixtureRoot = join(import.meta.dirname, "fixtures", "repos");

const fixtureExpectations = [
  {
    name: "typescript-api",
    expectedKinds: [
      "framework.detected",
      "database.dependency_detected",
      "cache.dependency_detected",
      "migration.directory_detected",
      "seed.directory_detected"
    ]
  },
  {
    name: "python-api",
    expectedKinds: [
      "framework.detected",
      "database.dependency_detected",
      "api.route_file_detected",
      "migration.directory_detected"
    ]
  },
  {
    name: "monorepo",
    expectedKinds: ["package_manager.detected", "application.detected", "framework.detected"]
  },
  {
    name: "api-plus-worker",
    expectedKinds: ["worker.detected", "cache.dependency_detected", "application.detected"]
  },
  {
    name: "frontend-plus-api",
    expectedKinds: ["framework.detected", "api.route_file_detected", "application.detected"]
  },
  {
    name: "compose-repo",
    expectedKinds: ["dockerfile.detected", "compose.file_detected", "service.detected"]
  },
  {
    name: "devcontainer-repo",
    expectedKinds: ["devcontainer.detected", "command.detected", "service.detected"]
  },
  {
    name: "ci-repo",
    expectedKinds: ["ci.workflow_detected", "command.detected"]
  },
  {
    name: "generated-repo",
    expectedKinds: ["generated.path_detected", "package_manager.detected"]
  },
  {
    name: "repo-skill-repo",
    expectedKinds: ["documentation.detected", "agent_instruction.detected", "repo_skill.detected"]
  },
  {
    name: "legacy-repo",
    expectedKinds: [
      "legacy.marker_detected",
      "legacy.replacement_detected",
      "legacy.command_candidate_detected"
    ]
  },
  {
    name: "invalid-config-repo",
    expectedKinds: []
  }
] as const;

describe("scanner integration", () => {
  it.each(fixtureExpectations)(
    "scans $name with full detector coverage",
    async ({ name, expectedKinds }) => {
      const result = await scanFixture(name);

      expect(result.errors).toEqual([]);
      expect(result.stats.detectors_failed).toBe(0);
      expect(result.stats.detectors_succeeded).toBe(createDefaultRepositoryDetectors().length);

      for (const kind of expectedKinds) {
        expect(result.facts.some((fact) => fact.kind === kind)).toBe(true);
      }

      expectImportantFactsToHaveEvidence(result.facts);
    }
  );

  it("normalizes fixture scans deterministically", async () => {
    const first = normalizeScanResult(await scanFixture("typescript-api"), { testMode: true });
    const second = normalizeScanResult(await scanFixture("typescript-api"), { testMode: true });

    expect(second).toEqual(first);
  });

  it("reports malformed configuration as recoverable scanner output", async () => {
    const result = await scanFixture("invalid-config-repo");

    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.map((warning) => warning.path)).toEqual(
      expect.arrayContaining(["package.json", ".github/workflows/broken.yml"])
    );
  });
});

async function scanFixture(name: string): Promise<RepositoryScanResult> {
  const root = join(fixtureRoot, name);
  const inventory = await buildFileInventory({
    root,
    includeUntracked: true
  });

  return scanRepository({
    root,
    inventory,
    detectors: createDefaultRepositoryDetectors()
  });
}

function expectImportantFactsToHaveEvidence(facts: readonly ScannerFact[]): void {
  for (const fact of facts.filter((candidate) => candidate.kind !== "language.detected")) {
    expect(fact.evidence.length, `${fact.kind} should include evidence`).toBeGreaterThan(0);

    for (const evidence of fact.evidence) {
      expect(evidence.source_path, `${fact.kind} evidence should include a path`).not.toBe("");
    }
  }
}
