import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  normalizeScanResult,
  scanRepository
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import { initializeRepository, mapScannerFactsToServices } from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("scanner facts to contract services", () => {
  it("maps Compose services with evidence", async () => {
    const result = mapScannerFactsToServices(await scanFixtureFacts("compose-repo"));

    expect(result.services).toMatchObject({
      "service-api": {
        id: "service-api",
        type: "container",
        compose_service: "api",
        ports: [3000]
      },
      db: {
        id: "db",
        type: "postgresql",
        compose_service: "db",
        image: "postgres:16",
        ports: [5432]
      },
      redis: {
        id: "redis",
        type: "redis",
        compose_service: "redis",
        image: "redis:7",
        ports: [6379]
      }
    });
    expect(result.services.db?.evidence?.length).toBeGreaterThan(0);
  });

  it("does not invent services for code-only dependencies", async () => {
    const result = mapScannerFactsToServices(await scanFixtureFacts("typescript-api"));

    expect(result.services).toEqual({});
    expect(result.reviewItems.map((item) => item.id)).toEqual(
      expect.arrayContaining(["service-postgresql-code-only", "service-redis-code-only"])
    );
  });

  it("initializes with services in the proposed contract", async () => {
    const result = await initializeRepository({
      root: fixture("compose-repo"),
      includeUntracked: true
    });

    expect(result.validation.ok).toBe(true);
    expect(result.proposedContract?.services).toMatchObject({
      db: {
        id: "db",
        type: "postgresql"
      },
      redis: {
        id: "redis",
        type: "redis"
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
