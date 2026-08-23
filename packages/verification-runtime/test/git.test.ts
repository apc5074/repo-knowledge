import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { detectGitChangeSet } from "../src/index.js";

const execFileAsync = promisify(execFile);

describe("@repo-knowledge/verification-runtime git change detection", () => {
  it("detects modified files relative to HEAD", async () => {
    const repositoryRoot = await createGitRepo();
    await writeFile(join(repositoryRoot, "changed.txt"), "updated\n", "utf8");

    const changeSet = await detectGitChangeSet({ repositoryRoot });

    expect(changeSet?.changedPaths).toEqual(["changed.txt"]);
  });

  it("returns undefined outside a git repository", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "board-verification-no-git-"));
    await expect(detectGitChangeSet({ repositoryRoot })).resolves.toBeUndefined();
  });
});

async function createGitRepo(): Promise<string> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "board-verification-git-"));
  await execFileAsync("git", ["init"], { cwd: repositoryRoot });
  await execFileAsync("git", ["config", "user.email", "board@example.com"], {
    cwd: repositoryRoot
  });
  await execFileAsync("git", ["config", "user.name", "Board"], { cwd: repositoryRoot });
  await writeFile(join(repositoryRoot, "tracked.txt"), "original\n", "utf8");
  await execFileAsync("git", ["add", "."], { cwd: repositoryRoot });
  await execFileAsync("git", ["commit", "-m", "initial"], { cwd: repositoryRoot });
  return repositoryRoot;
}
