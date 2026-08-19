import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  normalizeScanResult,
  scanRepository
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import { initializeRepository, mapScannerFactsToRelationships } from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("scanner facts to relationship contract sections", () => {
  it("maps explicit repository references when scanner facts carry them", () => {
    const result = mapScannerFactsToRelationships([
      {
        id: "related-checkout",
        kind: "documentation.detected",
        value: {
          name: "checkout-api",
          repository_url: "https://github.com/acme/checkout-api",
          relationship: "consumes_api",
          direction: "outbound",
          notes: "Documented integration."
        },
        confidence: "high",
        source: "deterministic",
        detector: "test",
        evidence: [
          {
            kind: "documentation",
            source_path: "docs/integrations.md",
            line_start: 1,
            line_end: 1,
            detector: "test",
            excerpt: "checkout-api"
          }
        ]
      }
    ]);

    expect(result.relatedRepositories).toEqual([
      expect.objectContaining({
        name: "checkout-api",
        provider: "github",
        repository_url: "https://github.com/acme/checkout-api",
        repository_slug: "acme/checkout-api",
        relationship: "consumes_api",
        direction: "outbound"
      })
    ]);
    expect(result.inferredFields).toContain("related_repositories");
  });

  it("maps explicit external API environment variables as external systems", () => {
    const result = mapScannerFactsToRelationships([
      {
        id: "env-stripe-api-url",
        kind: "environment.variable_detected",
        value: {
          name: "STRIPE_API_URL",
          source: "env-example",
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
            excerpt: "STRIPE_API_URL"
          }
        ]
      }
    ]);

    expect(result.externalSystems).toEqual([
      expect.objectContaining({
        id: "stripe",
        name: "Stripe",
        type: "payment_provider",
        relationship: "consumes_api",
        direction: "outbound"
      })
    ]);
  });

  it("does not turn local workspaces into related repositories", async () => {
    const result = mapScannerFactsToRelationships(await scanFixtureFacts("monorepo"));

    expect(result.relatedRepositories).toHaveLength(0);
    expect(result.reviewItems.length).toBeGreaterThan(0);
  });

  it("includes relationship output in initializeRepository proposed contracts", async () => {
    const result = await initializeRepository({
      root: fixture("typescript-api"),
      includeUntracked: true
    });

    expect(result.validation.ok).toBe(true);
    expect(result.proposedContract?.related_repositories).toEqual([]);
    expect(result.proposedContract?.external_systems).toEqual([]);
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
