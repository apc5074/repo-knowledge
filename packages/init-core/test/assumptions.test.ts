import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  normalizeScanResult,
  scanRepository
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import {
  buildContractProposal,
  generateLocalDevelopmentAssumptions,
  initializeRepository
} from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("local development assumptions", () => {
  it("summarizes package manager and setup assumptions separately from contract facts", async () => {
    const root = fixture("typescript-api");
    const scan = await scanFixture("typescript-api");
    const proposal = buildContractProposal({
      repositoryRoot: root,
      scan
    });
    const result = generateLocalDevelopmentAssumptions({
      facts: scan.facts,
      contract: proposal.contract
    });

    expect(result.assumptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "setup-migrate",
          value: "prisma migrate deploy",
          source: "contract"
        })
      ])
    );
    expect(result.inferredFields).toContain("local_development_assumptions");
  });

  it("marks uncertain app ports for review", async () => {
    const result = generateLocalDevelopmentAssumptions({
      facts: [],
      contract: {
        version: 1,
        repository: {
          name: "ports",
          type: "service",
          primary_language: "typescript"
        },
        applications: {
          api: {
            id: "api",
            type: "api",
            ports: [3000]
          }
        }
      }
    });

    expect(result.assumptions.filter((assumption) => assumption.id.startsWith("port-"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          confidence: "medium",
          reviewRequired: true
        })
      ])
    );
    expect(result.unconfirmedFields.some((field) => field.startsWith("port-"))).toBe(true);
  });

  it("initializeRepository exposes local development assumptions", async () => {
    const result = await initializeRepository({
      root: fixture("typescript-api"),
      includeUntracked: true
    });

    expect(result.localDevelopmentAssumptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "setup-migrate"
        })
      ])
    );
    expect(result.inferredFields).toContain("local_development_assumptions");
  });
});

async function scanFixture(name: string) {
  const root = fixture(name);
  const inventory = await buildFileInventory({
    root,
    includeUntracked: true
  });
  return normalizeScanResult(
    await scanRepository({
      root,
      inventory,
      detectors: createDefaultRepositoryDetectors()
    }),
    {
      testMode: true
    }
  );
}

function fixture(name: string): string {
  return join(fixtureRoot, name);
}
