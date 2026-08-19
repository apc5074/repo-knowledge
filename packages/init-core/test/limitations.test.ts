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
  initializeRepository,
  mapScannerFactsToKnownLimitations,
  mapScannerFactsToServices,
  mapScannerFactsToSetup
} from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("scanner facts to known limitations", () => {
  it("maps code-only service dependencies as unverified local limitations", async () => {
    const facts = await scanFixtureFacts("typescript-api");
    const result = mapScannerFactsToKnownLimitations({
      facts,
      setup: mapScannerFactsToSetup(facts).setup
    });

    expect(result.knownLimitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "postgresql-local-service-not-defined",
          status: "unverified"
        })
      ])
    );
    expect(result.inferredFields).toContain("known_limitations");
  });

  it("maps detected seed directories without seed commands", () => {
    const result = mapScannerFactsToKnownLimitations({
      facts: [
        {
          id: "seed-dir",
          kind: "seed.directory_detected",
          value: {
            path: "db/seeds",
            tool: "custom"
          },
          confidence: "high",
          source: "deterministic",
          detector: "test",
          evidence: [
            {
              kind: "source",
              source_path: "db/seeds/users.sql",
              line_start: 1,
              line_end: 1,
              detector: "test",
              excerpt: "seed"
            }
          ]
        }
      ],
      setup: {}
    });

    expect(result.knownLimitations).toEqual([
      expect.objectContaining({
        id: "seed-data-command-not-detected",
        summary: "Seed data was detected but no seed command was found."
      })
    ]);
  });

  it("maps Compose services without health checks", async () => {
    const facts = await scanFixtureFacts("compose-repo");
    const services = mapScannerFactsToServices(facts).services;
    const result = mapScannerFactsToKnownLimitations({
      facts,
      services,
      setup: mapScannerFactsToSetup(facts).setup
    });

    expect(result.knownLimitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "service-api-health-check-not-detected",
          applies_to: ["service-api"]
        })
      ])
    );
  });

  it("includes known limitations in initializeRepository proposed contracts", async () => {
    const result = await initializeRepository({
      root: fixture("typescript-api"),
      includeUntracked: true
    });

    expect(result.validation.ok).toBe(true);
    expect(result.proposedContract?.known_limitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "postgresql-local-service-not-defined"
        })
      ])
    );
  });
});

async function scanFixtureFacts(name: string) {
  const root = fixture(name);
  const inventory = await buildFileInventory({
    root,
    includeUntracked: true
  });
  const result = normalizeScanResult(
    await scanRepository({
      root,
      inventory,
      detectors: createDefaultRepositoryDetectors()
    }),
    {
      testMode: true
    }
  );

  return result.facts;
}

function fixture(name: string): string {
  return join(fixtureRoot, name);
}
