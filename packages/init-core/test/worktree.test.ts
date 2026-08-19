import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { getWorktreeStatus, initializeRepository, worktreeWarnings } from "../src/index.js";

const execFileAsync = promisify(execFile);

describe("worktree safety checks", () => {
  it("supports non-Git repositories with a warning", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-init-non-git-"));
    const status = await getWorktreeStatus({
      repositoryRoot: root,
      targetFiles: [".board/repository.yaml"]
    });

    expect(status).toMatchObject({
      isGitRepository: false,
      dirty: false,
      targetFiles: [".board/repository.yaml"]
    });
    expect(worktreeWarnings(status)).toEqual([
      "Repository is not inside a Git worktree; Git safety checks were skipped."
    ]);
  });

  it("detects modified and untracked files in Git repositories", async () => {
    const root = await gitRepo("board-init-git-status-");
    await writeFile(join(root, "package.json"), '{"name":"changed"}\n', "utf8");
    await mkdir(join(root, ".board"));
    await writeFile(join(root, ".board/repository.yaml"), "version: 1\n", "utf8");

    const status = await getWorktreeStatus({
      repositoryRoot: root,
      targetFiles: [".board/repository.yaml"]
    });

    expect(status.isGitRepository).toBe(true);
    expect(status.dirty).toBe(true);
    expect(status.modifiedFiles).toContain("package.json");
    expect(status.untrackedFiles).toContain(".board/repository.yaml");
    expect(status.dirtyTargetFiles).toEqual([".board/repository.yaml"]);
  });

  it("write mode does not overwrite dirty target files without force", async () => {
    const root = await gitRepo("board-init-dirty-target-");
    await mkdir(join(root, ".board"));
    await writeFile(
      join(root, ".board/repository.yaml"),
      [
        "version: 1",
        "repository:",
        "  name: dirty-target",
        "  type: service",
        "  primary_language: javascript",
        ""
      ].join("\n"),
      "utf8"
    );

    const result = await initializeRepository({
      root,
      includeUntracked: true,
      mode: "write"
    });

    expect(result.filesWritten).toEqual([]);
    expect(result.worktree?.dirtyTargetFiles).toEqual([".board/repository.yaml"]);
    expect(result.workflowSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "apply-artifact-proposal",
          status: "skipped",
          summary: "Skipped writes because target files are dirty and force was not set."
        })
      ])
    );
    await expect(readFile(join(root, ".board/repository.yaml"), "utf8")).resolves.not.toContain(
      "applications:"
    );
  });

  it("force allows write mode to update dirty target files", async () => {
    const root = await gitRepo("board-init-dirty-target-force-");
    await mkdir(join(root, ".board"));
    await writeFile(
      join(root, ".board/repository.yaml"),
      [
        "version: 1",
        "repository:",
        "  name: dirty-target",
        "  type: service",
        "  primary_language: javascript",
        ""
      ].join("\n"),
      "utf8"
    );

    const result = await initializeRepository({
      root,
      includeUntracked: true,
      mode: "write",
      force: true
    });

    expect(result.filesWritten).toContain(".board/repository.yaml");
    await expect(readFile(join(root, ".board/repository.yaml"), "utf8")).resolves.toContain(
      "applications:"
    );
  });
});

async function gitRepo(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await execFileAsync("git", ["init"], { cwd: root });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "dirty-target",
      scripts: {
        test: "vitest run"
      },
      dependencies: {
        express: "^5.0.0"
      }
    }),
    "utf8"
  );
  await execFileAsync("git", ["add", "package.json"], { cwd: root });

  // Keep the repository without commits; index state is enough for porcelain status checks.
  await stat(join(root, ".git"));
  return root;
}
