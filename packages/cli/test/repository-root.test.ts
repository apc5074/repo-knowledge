import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { discoverRepositoryRoot } from "../src/index.js";

describe("repository root discovery", () => {
  it("finds a parent .git directory", async () => {
    const root = await createDirectory("git-root");
    const nested = join(root, "apps/api/src");

    await mkdir(join(root, ".git"), { recursive: true });
    await mkdir(nested, { recursive: true });

    await expect(discoverRepositoryRoot(nested)).resolves.toEqual({
      ok: true,
      root,
      foundBy: "git",
      startDirectory: nested
    });
  });

  it("finds a board contract when .git is absent", async () => {
    const root = await createDirectory("contract-root");
    const nested = join(root, "packages/cli/src");

    await mkdir(join(root, ".board"), { recursive: true });
    await writeFile(join(root, ".board/repository.yaml"), "version: 1\n", "utf8");
    await mkdir(nested, { recursive: true });

    await expect(discoverRepositoryRoot(nested)).resolves.toEqual({
      ok: true,
      root,
      foundBy: "board-contract",
      startDirectory: nested
    });
  });

  it("reports not found without throwing", async () => {
    const directory = await createDirectory("missing-root");

    const result = await discoverRepositoryRoot(directory);

    expect(result).toMatchObject({
      ok: false,
      reason: "not-found",
      startDirectory: directory
    });
    expect(result.message).toContain(directory);
  });
});

async function createDirectory(name: string): Promise<string> {
  const directory = join(tmpdir(), `board-cli-${name}-${randomUUID()}`);

  await mkdir(directory, { recursive: true });

  return directory;
}
