import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  normalizeScanResult,
  scanRepository
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import { initializeRepository, mapScannerFactsToPathRules } from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("scanner path facts to contract path rules", () => {
  it("maps generated directories with regeneration commands and unsafe edit guidance", async () => {
    const result = mapScannerFactsToPathRules(await scanFixtureFacts("generated-repo"));

    expect(result.generatedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pattern: "src/generated/**",
          generated_by: expect.objectContaining({
            command: "openapi-typescript schema/openapi.json -o src/generated/api.ts"
          })
        })
      ])
    );
    expect(result.unsafePaths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pattern: "src/generated/**",
          reason: "Generated output should not be edited directly."
        })
      ])
    );
    expect(result.inferredFields).toEqual(
      expect.arrayContaining(["generated_files", "unsafe_paths"])
    );
  });

  it("maps secret env examples into sensitive path rules", async () => {
    const result = mapScannerFactsToPathRules([
      {
        id: "env-api-key",
        kind: "environment.variable_detected",
        value: {
          name: "API_KEY",
          source: "env-example",
          secret: true
        },
        confidence: "high",
        source: "deterministic",
        detector: "test",
        evidence: [
          {
            kind: "config",
            source_path: "apps/api/.env.example",
            line_start: 1,
            line_end: 1,
            detector: "test",
            excerpt: "API_KEY"
          }
        ]
      }
    ]);

    expect(result.sensitivePaths).toEqual([
      expect.objectContaining({
        pattern: "apps/api/.env*",
        risk: "May contain local credentials or tokens."
      })
    ]);
  });

  it("includes path rules in initializeRepository proposed contracts", async () => {
    const result = await initializeRepository({
      root: fixture("generated-repo"),
      includeUntracked: true
    });

    expect(result.validation.ok).toBe(true);
    expect(result.proposedContract?.generated_files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pattern: "src/generated/**"
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
