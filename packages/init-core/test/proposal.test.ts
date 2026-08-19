import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { serializeRepositoryContract } from "@repo-knowledge/repository-contract";
import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  normalizeScanResult,
  scanRepository
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import { buildContractProposal, initializeRepository } from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("contract proposal builder", () => {
  it("builds and validates a proposal for a new repository", async () => {
    const root = fixture("typescript-api");
    const proposal = buildContractProposal({
      repositoryRoot: root,
      scan: await scanFixture("typescript-api")
    });

    expect(proposal.validation.ok).toBe(true);
    expect(proposal.contract.repository.name).toBe("typescript-api");
    expect(proposal.contract.environment?.DATABASE_URL).toBeDefined();
    expect(proposal.existingContract).toBeUndefined();
  });

  it("merges an existing valid contract and preserves maintainer fields", async () => {
    const root = fixture("typescript-api");
    const proposal = buildContractProposal({
      repositoryRoot: root,
      scan: await scanFixture("typescript-api"),
      existingContract: {
        path: ".board/repository.yaml",
        content: serializeRepositoryContract({
          version: 1,
          repository: {
            name: "typescript-api",
            type: "service",
            primary_language: "typescript",
            purpose: "Human reviewed local contract.",
            owners: ["platform"]
          }
        })
      }
    });

    expect(proposal.validation.ok).toBe(true);
    expect(proposal.existingContract).toBeDefined();
    expect(proposal.contract.repository).toMatchObject({
      purpose: "Human reviewed local contract.",
      owners: ["platform"]
    });
  });

  it("surfaces invalid existing contracts as review items", async () => {
    const root = fixture("typescript-api");
    const proposal = buildContractProposal({
      repositoryRoot: root,
      scan: await scanFixture("typescript-api"),
      existingContract: {
        path: ".board/repository.yaml",
        content: "version: 1\nrepository:\n  name: broken\n"
      }
    });

    expect(proposal.validation.ok).toBe(true);
    expect(proposal.reviewItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "existing-contract-invalid",
          kind: "conflict",
          summary: expect.stringContaining("repository.type:")
        })
      ])
    );
    expect(proposal.warnings).toHaveLength(1);
  });

  it("initializeRepository reads and merges the default contract path", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-init-proposal-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "merge-repo",
        scripts: {
          test: "vitest run"
        }
      }),
      "utf8"
    );
    await mkdir(join(root, ".board"));
    await writeFile(
      join(root, ".board/repository.yaml"),
      serializeRepositoryContract({
        version: 1,
        repository: {
          name: "merge-repo",
          type: "service",
          primary_language: "typescript",
          purpose: "Keep this purpose."
        }
      }),
      "utf8"
    );

    const result = await initializeRepository({
      root,
      includeUntracked: true
    });

    expect(result.validation.ok).toBe(true);
    expect(result.proposedContract?.repository.purpose).toBe("Keep this purpose.");
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
