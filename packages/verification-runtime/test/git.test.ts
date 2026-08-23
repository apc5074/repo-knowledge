import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { detectGitChangeSet } from "../src/index.js";

const execFileAsync = promisify(execFile);

describe("@repo-knowledge/verification-runtime git change detection", () => {
  it("reports a clean repository with no changed paths", async () => {
    const repositoryRoot = await createGitRepo();

    const changeSet = await detectGitChangeSet({ repositoryRoot });

    expect(changeSet?.changedPaths).toEqual([]);
  });

  it("detects modified files relative to HEAD", async () => {
    const repositoryRoot = await createGitRepo();
    await writeFile(join(repositoryRoot, "changed.txt"), "updated\n", "utf8");

    const changeSet = await detectGitChangeSet({ repositoryRoot });

    expect(changeSet?.changedPaths).toEqual(["changed.txt"]);
  });

  it("detects staged files", async () => {
    const repositoryRoot = await createGitRepo();
    await writeFile(join(repositoryRoot, "staged.txt"), "staged\n", "utf8");
    await execFileAsync("git", ["add", "staged.txt"], { cwd: repositoryRoot });

    const changeSet = await detectGitChangeSet({ repositoryRoot });

    expect(changeSet?.changedPaths).toContain("staged.txt");
  });

  it("detects deleted files", async () => {
    const repositoryRoot = await createGitRepo();
    await rm(join(repositoryRoot, "tracked.txt"));

    const changeSet = await detectGitChangeSet({ repositoryRoot });

    expect(changeSet?.changedPaths).toContain("tracked.txt");
  });

  it("detects renamed files relative to an explicit base ref", async () => {
    const repositoryRoot = await createGitRepo();
    await rename(join(repositoryRoot, "tracked.txt"), join(repositoryRoot, "renamed.txt"));

    const changeSet = await detectGitChangeSet({ repositoryRoot, baseRef: "HEAD" });

    expect(changeSet?.baseRef).toBe("HEAD");
    expect(changeSet?.changedPaths).toContain("renamed.txt");
  });

  it("returns undefined outside a git repository", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "board-verification-no-git-"));
    await expect(detectGitChangeSet({ repositoryRoot })).resolves.toBeUndefined();
  });

  it("reports invalid base refs as warnings", async () => {
    const repositoryRoot = await createGitRepo();

    const changeSet = await detectGitChangeSet({ repositoryRoot, baseRef: "missing-ref" });

    expect(changeSet?.changedPaths).toEqual([]);
    expect(changeSet?.warnings[0]).toContain("missing-ref");
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
