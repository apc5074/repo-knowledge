import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  normalizeScanResult,
  scanRepository
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import { detectMissingDevelopmentScripts, initializeRepository } from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("missing development script detection", () => {
  it("reports missing readiness capabilities without inventing commands", async () => {
    const result = detectMissingDevelopmentScripts(await scanFixtureFacts("typescript-api"));
    const capabilities = result.gaps.map((gap) => gap.capability);

    expect(capabilities).toEqual(
      expect.arrayContaining(["install", "stop", "healthcheck", "verify"])
    );
    expect(capabilities).not.toContain("lint");
    expect(capabilities).not.toContain("typecheck");
    expect(capabilities).not.toContain("migrate");
    expect(capabilities).not.toContain("seed");
    expect(result.reviewItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missing-script-healthcheck",
          kind: "missing-evidence"
        })
      ])
    );
  });

  it("respects existing conventions from scripts and task files", async () => {
    const result = detectMissingDevelopmentScripts([
      commandFact("install", "pnpm install", "install"),
      commandFact("dev", "vite", "development"),
      commandFact("stop", "docker compose down", "custom"),
      commandFact("migrate", "prisma migrate deploy", "migration"),
      commandFact("seed", "tsx prisma/seed.ts", "seed"),
      commandFact("healthcheck", "curl localhost:3000/health", "healthcheck"),
      commandFact("verify", "pnpm verify", "verification"),
      commandFact("test", "vitest run", "test"),
      commandFact("lint", "eslint .", "lint"),
      commandFact("typecheck", "tsc --noEmit", "typecheck")
    ]);

    expect(result.gaps).toEqual([]);
    expect(result.reviewItems).toEqual([]);
  });

  it("initializeRepository includes script gap review items", async () => {
    const result = await initializeRepository({
      root: fixture("typescript-api"),
      includeUntracked: true
    });

    expect(result.reviewItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missing-script-healthcheck"
        })
      ])
    );
    expect(result.inferredFields).toContain("script_gaps");
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

function commandFact(name: string, command: string, category: string) {
  return {
    id: `command-${name}`,
    kind: "command.detected" as const,
    value: {
      name,
      command,
      category,
      cwd: "."
    },
    confidence: "high" as const,
    source: "deterministic" as const,
    detector: "test",
    evidence: [
      {
        kind: "config" as const,
        source_path: "package.json",
        line_start: 1,
        line_end: 1,
        detector: "test",
        excerpt: name
      }
    ]
  };
}

function fixture(name: string): string {
  return join(fixtureRoot, name);
}
