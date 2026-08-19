import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  normalizeScanResult,
  scanRepository
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import { initializeRepository, mapScannerFactsToApplications } from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("scanner facts to contract applications", () => {
  it("maps an API application with commands and evidence", async () => {
    const result = mapScannerFactsToApplications(await scanFixtureFacts("typescript-api"));

    expect(result.applications).toMatchObject({
      api: {
        id: "api",
        type: "api",
        working_directory: ".",
        dev: {
          command: "tsx src/server.ts",
          working_directory: "."
        }
      }
    });
    expect(result.applications.api?.evidence?.length).toBeGreaterThan(0);
  });

  it("maps frontend and API candidates from a combined repository", async () => {
    const result = mapScannerFactsToApplications(await scanFixtureFacts("frontend-plus-api"));

    expect(Object.values(result.applications).map((app) => app.type)).toEqual(
      expect.arrayContaining(["frontend", "api"])
    );
  });

  it("maps worker candidates without accepting low-confidence test paths", async () => {
    const result = mapScannerFactsToApplications(await scanFixtureFacts("api-plus-worker"));

    expect(Object.values(result.applications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "worker",
          working_directory: "."
        })
      ])
    );
    expect(result.reviewItems.every((item) => item.kind === "low-confidence")).toBe(true);
  });

  it("keeps monorepo application IDs deterministic", async () => {
    const first = mapScannerFactsToApplications(await scanFixtureFacts("monorepo"));
    const second = mapScannerFactsToApplications(await scanFixtureFacts("monorepo"));

    expect(second.applications).toEqual(first.applications);
    expect(Object.keys(first.applications)).toEqual(expect.arrayContaining(["web", "api"]));
  });

  it("initializes with applications in the proposed contract", async () => {
    const result = await initializeRepository({
      root: fixture("typescript-api"),
      includeUntracked: true
    });

    expect(result.validation.ok).toBe(true);
    expect(result.proposedContract?.applications).toMatchObject({
      api: {
        id: "api",
        type: "api"
      }
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
