import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { discoverRepositoryRoot, resolveContractPath } from "../src/index.js";

describe("contract path discovery", () => {
  it("finds the default contract path under the repository root", async () => {
    const root = await createRepository("default-path", true);
    const nested = join(root, "packages/api");
    const repositoryRoot = await discoverRepositoryRoot(nested);

    await expect(
      resolveContractPath({
        currentWorkingDirectory: nested,
        repositoryRoot
      })
    ).resolves.toEqual({
      ok: true,
      path: join(root, ".board/repository.yaml"),
      source: "repository-default",
      repositoryRoot: root
    });
  });

  it("respects explicit config paths without parsing the contract", async () => {
    const root = await createRepository("explicit-config", false);
    const contractPath = join(root, "custom/contract.yaml");

    await mkdir(join(root, "custom"), { recursive: true });
    await writeFile(contractPath, "not: a validated contract\n", "utf8");

    await expect(
      resolveContractPath({
        currentWorkingDirectory: root,
        explicitPath: "custom/contract.yaml",
        explicitPathSource: "config",
        repositoryRoot: await discoverRepositoryRoot(root)
      })
    ).resolves.toEqual({
      ok: true,
      path: contractPath,
      source: "config"
    });
  });

  it("distinguishes a missing repository from a missing contract", async () => {
    const directory = await createDirectory("missing-repo");
    const repositoryRoot = await discoverRepositoryRoot(directory);

    await expect(
      resolveContractPath({
        currentWorkingDirectory: directory,
        repositoryRoot
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: "repository-not-found",
      nextSteps: ["Run board init from the repository root."]
    });
  });

  it("reports missing contracts with an actionable next step", async () => {
    const root = await createRepository("missing-contract", false);

    await expect(
      resolveContractPath({
        currentWorkingDirectory: root,
        repositoryRoot: await discoverRepositoryRoot(root)
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: "contract-not-found",
      attemptedPath: join(root, ".board/repository.yaml"),
      repositoryRoot: root,
      nextSteps: ["Run board init to create .board/repository.yaml."]
    });
  });
});

async function createRepository(name: string, withContract: boolean): Promise<string> {
  const directory = await createDirectory(name);

  await mkdir(join(directory, ".git"), { recursive: true });

  if (withContract) {
    await mkdir(join(directory, ".board"), { recursive: true });
    await writeFile(join(directory, ".board/repository.yaml"), "version: 1\n", "utf8");
  }

  return directory;
}

async function createDirectory(name: string): Promise<string> {
  const directory = join(tmpdir(), `board-cli-${name}-${randomUUID()}`);

  await mkdir(directory, { recursive: true });

  return directory;
}
