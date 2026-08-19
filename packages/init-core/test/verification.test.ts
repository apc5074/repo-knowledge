import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  normalizeScanResult,
  scanRepository
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import { initializeRepository, mapScannerFactsToVerification } from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("scanner command facts to verification", () => {
  it("maps default test, lint, and typecheck checks", async () => {
    const result = mapScannerFactsToVerification(await scanFixtureFacts("typescript-api"));

    expect(result.verification.default).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "lint",
          kind: "lint",
          command: expect.objectContaining({
            command: "eslint .",
            working_directory: "."
          })
        }),
        expect.objectContaining({
          id: "typecheck",
          kind: "typecheck",
          command: expect.objectContaining({
            command: "tsc --noEmit",
            working_directory: "."
          })
        }),
        expect.objectContaining({
          id: "unit-test",
          kind: "test",
          command: expect.objectContaining({
            command: "vitest run",
            working_directory: "."
          })
        })
      ])
    );
    expect(result.verification.default?.[0]?.evidence?.length).toBeGreaterThan(0);
  });

  it("deduplicates local and CI-derived validation commands", async () => {
    const result = mapScannerFactsToVerification(await scanFixtureFacts("ci-repo"));

    expect(result.verification.default?.map((check) => check.kind)).toEqual([
      "lint",
      "test",
      "build"
    ]);
    expect(result.reviewItems.length).toBeGreaterThan(0);
  });

  it("includes verification output in initializeRepository proposed contracts", async () => {
    const result = await initializeRepository({
      root: fixture("ci-repo"),
      includeUntracked: true
    });

    expect(result.validation.ok).toBe(true);
    expect(result.proposedContract?.verification?.default).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "build",
          command: expect.objectContaining({
            command: "tsc -p tsconfig.json"
          })
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
