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
  mapScannerFactsToApplications,
  mapScannerFactsToEnvironment,
  mapScannerFactsToServices
} from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("scanner environment facts to contract environment", () => {
  it("maps env example and source references without storing values", async () => {
    const facts = await scanFixtureFacts("typescript-api");
    const applications = mapScannerFactsToApplications(facts).applications;
    const services = mapScannerFactsToServices(facts).services;
    const result = mapScannerFactsToEnvironment({ facts, applications, services });

    expect(result.environment.DATABASE_URL).toMatchObject({
      name: "DATABASE_URL",
      required: true,
      secret: true,
      source: "scanner"
    });
    expect(result.environment.PORT).toMatchObject({
      name: "PORT",
      secret: false
    });
    expect(result.environment.DATABASE_URL.example_value).toBeUndefined();
    expect(result.environment.DATABASE_URL.default_for_local).toBeUndefined();
    expect(result.environment.DATABASE_URL.evidence?.length).toBeGreaterThan(0);
    expect(result.inferredFields).toContain("environment");
  });

  it("marks secret-looking variables for review", async () => {
    const result = mapScannerFactsToEnvironment([
      {
        id: "env-api-key",
        kind: "environment.variable_detected",
        value: {
          name: "OPENAI_API_KEY",
          source: "env-example",
          secret: true,
          required: true
        },
        confidence: "high",
        source: "deterministic",
        detector: "test",
        evidence: [
          {
            kind: "config",
            source_path: ".env.example",
            line_start: 1,
            line_end: 1,
            detector: "test",
            excerpt: "OPENAI_API_KEY"
          }
        ]
      }
    ]);

    expect(result.environment.OPENAI_API_KEY).toMatchObject({
      name: "OPENAI_API_KEY",
      required: true,
      secret: true
    });
    expect(result.reviewItems).toHaveLength(1);
  });

  it("includes environment output in initializeRepository proposed contracts", async () => {
    const result = await initializeRepository({
      root: fixture("typescript-api"),
      includeUntracked: true
    });

    expect(result.validation.ok).toBe(true);
    expect(result.proposedContract?.environment?.DATABASE_URL).toMatchObject({
      name: "DATABASE_URL",
      source: "scanner"
    });
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
