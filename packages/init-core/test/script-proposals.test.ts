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
  detectMissingDevelopmentScripts,
  generateScriptProposals,
  initializeRepository
} from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("script proposal generation", () => {
  it("creates reviewable package script proposals for JS repositories", async () => {
    const facts = await scanFixtureFacts("typescript-api");
    const gaps = detectMissingDevelopmentScripts(facts);
    const result = generateScriptProposals({
      gaps: gaps.gaps,
      facts
    });

    expect(result.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "script-proposal-install",
          target: "package.json",
          suggestedName: "install",
          suggestedCommand: undefined,
          reviewRequired: true
        }),
        expect.objectContaining({
          id: "script-proposal-verify",
          target: "package.json",
          suggestedName: "verify",
          suggestedCommand: undefined
        })
      ])
    );
    expect(result.inferredFields).toContain("script_proposals");
  });

  it("does not invent command bodies when evidence is weak", () => {
    const result = generateScriptProposals({
      gaps: [
        {
          capability: "healthcheck",
          title: "Missing healthcheck script",
          summary: "No verified healthcheck command was detected.",
          recommendation: "Add or document a healthcheck command."
        }
      ],
      facts: []
    });

    expect(result.proposals).toEqual([
      expect.objectContaining({
        target: "scripts/dev",
        suggestedName: "healthcheck",
        suggestedCommand: undefined,
        reviewRequired: true
      })
    ]);
  });

  it("suggests command bodies when enough convention evidence exists", () => {
    const result = generateScriptProposals({
      gaps: [
        {
          capability: "install",
          title: "Missing install script",
          summary: "No install script was detected.",
          recommendation: "Add or document an install command."
        },
        {
          capability: "verify",
          title: "Missing verify script",
          summary: "No verify script was detected.",
          recommendation: "Add or document a verify command."
        }
      ],
      facts: [
        packageManagerFact("pnpm"),
        commandFact("typecheck", "tsc --noEmit", "typecheck"),
        commandFact("lint", "eslint .", "lint"),
        commandFact("test", "vitest run", "test")
      ]
    });

    expect(result.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "script-proposal-install",
          suggestedCommand: "pnpm install"
        }),
        expect.objectContaining({
          id: "script-proposal-verify",
          suggestedCommand: "pnpm run typecheck && pnpm run lint && pnpm run test"
        })
      ])
    );
  });

  it("initializeRepository exposes script proposals", async () => {
    const result = await initializeRepository({
      root: fixture("typescript-api"),
      includeUntracked: true
    });

    expect(result.scriptProposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "script-proposal-install"
        })
      ])
    );
    expect(result.inferredFields).toContain("script_proposals");
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

function packageManagerFact(name: string) {
  return {
    id: `package-manager-${name}`,
    kind: "package_manager.detected" as const,
    value: {
      name
    },
    confidence: "high" as const,
    source: "deterministic" as const,
    detector: "test",
    evidence: [
      {
        kind: "config" as const,
        source_path: "pnpm-lock.yaml",
        line_start: 1,
        line_end: 1,
        detector: "test",
        excerpt: name
      }
    ]
  };
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
