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

import { initializeRepository, mapScannerFactsToRepositorySection } from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("scanner facts to repository section", () => {
  it("maps a TypeScript API repository", async () => {
    const result = mapScannerFactsToRepositorySection({
      repositoryRoot: fixture("typescript-api"),
      facts: await scanFixtureFacts("typescript-api")
    });

    expect(result.repository).toMatchObject({
      name: "typescript-api",
      type: "service",
      primary_language: "typescript",
      languages: expect.arrayContaining(["javascript", "typescript"])
    });
    expect(result.unconfirmedFields).toEqual([]);
  });

  it("maps a Python API repository", async () => {
    const result = mapScannerFactsToRepositorySection({
      repositoryRoot: fixture("python-api"),
      facts: await scanFixtureFacts("python-api")
    });

    expect(result.repository).toMatchObject({
      name: "python-api",
      type: "service",
      primary_language: "python",
      languages: ["python"]
    });
  });

  it("maps a workspace repository as a monorepo", async () => {
    const result = mapScannerFactsToRepositorySection({
      repositoryRoot: fixture("monorepo"),
      facts: await scanFixtureFacts("monorepo")
    });

    expect(result.repository).toMatchObject({
      name: "fixture-monorepo",
      type: "monorepo",
      primary_language: "typescript"
    });
  });

  it("uses directory fallback and review items for a minimal repository", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-init-minimal-"));

    await writeFile(join(root, "README.md"), "# Minimal\n", "utf8");

    const result = mapScannerFactsToRepositorySection({
      repositoryRoot: root,
      facts: await scanFacts(root)
    });

    expect(result.repository).toMatchObject({
      name: expect.stringMatching(/^board-init-minimal-/),
      type: "unknown",
      primary_language: "unknown"
    });
    expect(result.unconfirmedFields).toEqual(["repository.primary_language", "repository.type"]);
    expect(result.reviewItems.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "repository-name-from-directory",
        "repository-type-unconfirmed",
        "repository-primary-language-unconfirmed"
      ])
    );
  });

  it("initializes with a valid proposed repository contract section", async () => {
    const result = await initializeRepository({
      root: fixture("python-api"),
      includeUntracked: true
    });

    expect(result.validation.ok).toBe(true);
    expect(result.proposedContract?.repository).toMatchObject({
      name: "python-api",
      type: "service",
      primary_language: "python"
    });
    expect(result.inferredFields).toEqual(
      expect.arrayContaining(["repository.name", "repository.type", "repository.primary_language"])
    );
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
