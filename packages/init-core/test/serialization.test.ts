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
  buildContractProposal,
  initializeRepository,
  serializeContractForInit
} from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("init contract serialization", () => {
  it("serializes, parses back, and validates generated contracts", async () => {
    const root = fixture("typescript-api");
    const proposal = buildContractProposal({
      repositoryRoot: root,
      scan: await scanFixture("typescript-api")
    });
    const serialized = serializeContractForInit(proposal.contract);

    expect(serialized.validation.ok).toBe(true);
    expect(serialized.contract).toEqual(proposal.contract);
    expect(serialized.content).toContain("version: 1\nrepository:");
    expect(serialized.content).not.toContain("related_repositories:");
  });

  it("is deterministic for the same proposed contract", async () => {
    const root = fixture("generated-repo");
    const proposal = buildContractProposal({
      repositoryRoot: root,
      scan: await scanFixture("generated-repo")
    });

    expect(serializeContractForInit(proposal.contract).content).toBe(
      serializeContractForInit(proposal.contract).content
    );
  });

  it("initializeRepository includes serialized contract artifact content", async () => {
    const result = await initializeRepository({
      root: fixture("typescript-api"),
      includeUntracked: true
    });
    const contractArtifact = result.artifacts.find(
      (artifact) => artifact.path === ".board/repository.yaml"
    );

    expect(result.validation.ok).toBe(true);
    expect(contractArtifact).toMatchObject({
      action: "create",
      approvalRequired: true
    });
    expect(contractArtifact?.content).toContain("repository:");
    expect(result.filesToCreate).toEqual([".board/repository.yaml"]);
  });
});

async function scanFixture(name: string) {
  const root = fixture(name);
  const inventory = await buildFileInventory({
    root,
    includeUntracked: true
  });
  return normalizeScanResult(
    await scanRepository({
      root,
      inventory,
      detectors: createDefaultRepositoryDetectors()
    }),
    {
      testMode: true
    }
  );
}

function fixture(name: string): string {
  return join(fixtureRoot, name);
}
