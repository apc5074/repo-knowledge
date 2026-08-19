import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  normalizeScanResult,
  scanRepository
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import { initializeRepository, mapScannerFactsToSetup } from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("scanner command facts to setup", () => {
  it("maps migration and seed commands from package scripts", async () => {
    const result = mapScannerFactsToSetup(await scanFixtureFacts("typescript-api"));

    expect(result.setup).toMatchObject({
      migrate: {
        id: "migrate",
        command: "prisma migrate deploy",
        working_directory: "."
      },
      seed: {
        id: "seed",
        command: "tsx prisma/seed.ts",
        working_directory: "."
      }
    });
    expect(result.setup.migrate?.evidence?.length).toBeGreaterThan(0);
    expect(result.inferredFields).toContain("setup");
  });

  it("maps setup and health-check commands from Makefile targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-init-setup-"));

    await writeFile(
      join(root, "Makefile"),
      ["install:", "\tpnpm install", "healthcheck:", "\tcurl localhost:3000/health", ""].join("\n"),
      "utf8"
    );

    const result = mapScannerFactsToSetup(await scanFacts(root));

    expect(result.setup).toMatchObject({
      install: {
        command: "make install",
        working_directory: "."
      },
      health_check: {
        command: "make healthcheck",
        working_directory: "."
      }
    });
  });

  it("includes setup output in initializeRepository proposed contracts", async () => {
    const result = await initializeRepository({
      root: fixture("typescript-api"),
      includeUntracked: true
    });

    expect(result.validation.ok).toBe(true);
    expect(result.proposedContract?.setup).toMatchObject({
      migrate: {
        command: "prisma migrate deploy"
      },
      seed: {
        command: "tsx prisma/seed.ts"
      }
    });
  });
});

async function scanFixtureFacts(name: string) {
  return scanFacts(fixture(name));
}

async function scanFacts(root: string) {
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
