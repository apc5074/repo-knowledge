import { cp, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { parseRepositoryContract } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import { initializeRepository } from "../src/index.js";

const execFileAsync = promisify(execFile);
const initFixtureRoot = join(dirname(fileURLToPath(import.meta.url)), "fixtures/repos");

describe("board init integration flows", () => {
  it("dry-runs a new TypeScript API without writing files", async () => {
    const root = await copyFixture("typescript-api-new");
    const result = await initializeRepository({
      root,
      mode: "dry-run",
      includeUntracked: true
    });
    const contractArtifact = result.artifacts.find(
      (artifact) => artifact.path === ".board/repository.yaml"
    );

    expect(result.ok).toBe(true);
    expect(result.filesWritten).toEqual([]);
    expect(contractArtifact).toMatchObject({
      action: "create",
      diff: expect.stringContaining("+++ b/.board/repository.yaml")
    });
    expect(parseRepositoryContract(contractArtifact?.content ?? "")).toMatchObject({
      repository: {
        name: "typescript-api-new"
      }
    });
    await expect(stat(join(root, ".board/repository.yaml"))).rejects.toThrow();
  });

  it("writes and validates a new Python API contract", async () => {
    const root = await copyFixture("python-api-new");
    const result = await initializeRepository({
      root,
      mode: "write",
      includeUntracked: true
    });
    const written = await readFile(join(root, ".board/repository.yaml"), "utf8");

    expect(result.ok).toBe(true);
    expect(result.filesWritten).toEqual([".board", ".board/repository.yaml"]);
    expect(parseRepositoryContract(written)).toMatchObject({
      repository: {
        name: "python-api-new",
        primary_language: "python"
      }
    });
  });

  it("merges an existing valid contract and preserves reviewed fields", async () => {
    const root = await copyFixture("existing-valid-contract");
    const result = await initializeRepository({
      root,
      mode: "write",
      includeUntracked: true
    });
    const written = await readFile(join(root, ".board/repository.yaml"), "utf8");
    const contract = parseRepositoryContract(written);

    expect(result.ok).toBe(true);
    expect(result.filesToUpdate).toEqual([".board/repository.yaml"]);
    expect(contract.repository.purpose).toBe("Existing reviewed contract.");
  });

  it("handles an invalid existing contract without overwriting it", async () => {
    const root = await copyFixture("existing-invalid-contract");
    const original = await readFile(join(root, ".board/repository.yaml"), "utf8");
    const result = await initializeRepository({
      root,
      mode: "write",
      includeUntracked: true
    });
    const sidecar = await readFile(join(root, ".board/repository.generated.yaml"), "utf8");

    expect(result.ok).toBe(true);
    expect(result.filesWritten).toEqual([".board", ".board/repository.generated.yaml"]);
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".board/repository.yaml",
          action: "skip"
        })
      ])
    );
    expect(await readFile(join(root, ".board/repository.yaml"), "utf8")).toBe(original);
    expect(parseRepositoryContract(sidecar)).toMatchObject({
      repository: {
        name: "existing-invalid-contract"
      }
    });
  });

  it("surfaces missing script proposals as reviewable output", async () => {
    const root = await copyFixture("missing-scripts");
    const result = await initializeRepository({
      root,
      includeUntracked: true
    });

    expect(result.ok).toBe(true);
    expect(result.reviewItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missing-script-install"
        }),
        expect.objectContaining({
          id: "missing-script-verify"
        })
      ])
    );
    expect(result.scriptProposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "script-proposal-install"
        })
      ])
    );
  });

  it("warns for dirty target files and skips unsafe writes", async () => {
    const root = await copyFixture("dirty-worktree");

    await execFileAsync("git", ["init"], { cwd: root });
    await execFileAsync("git", ["add", "package.json"], { cwd: root });

    const result = await initializeRepository({
      root,
      mode: "write",
      includeUntracked: true
    });

    expect(result.filesWritten).toEqual([]);
    expect(result.worktree?.dirtyTargetFiles).toEqual([".board/repository.yaml"]);
    expect(result.workflowSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "apply-artifact-proposal",
          status: "skipped"
        })
      ])
    );
  });

  it("initializes non-Git repositories with a warning", async () => {
    const root = await copyFixture("non-git-repository");
    const result = await initializeRepository({
      root,
      includeUntracked: true
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain(
      "Repository is not inside a Git worktree; Git safety checks were skipped."
    );
    expect(result.worktree?.isGitRepository).toBe(false);
  });

  it("keeps result JSON serializable for agents", async () => {
    const root = await copyFixture("api-plus-worker");
    const result = await initializeRepository({
      root,
      includeUntracked: true
    });
    const serialized = JSON.parse(JSON.stringify(result)) as typeof result;

    expect(serialized.proposalId).toMatch(/^proposal-local-/);
    expect(serialized.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".board/repository.yaml",
          action: "create"
        })
      ])
    );
    expect(serialized.proposedContract?.applications).toBeDefined();
  });
});

async function copyFixture(name: string): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), `board-init-integration-${name}-`));

  await cp(join(initFixtureRoot, name), target, {
    recursive: true,
    verbatimSymlinks: true
  });

  return target;
}
