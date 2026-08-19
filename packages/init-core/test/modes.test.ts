import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { initializeRepository } from "../src/index.js";

describe("init dry-run and write modes", () => {
  it("dry-run proposes artifacts without creating .board", async () => {
    const root = await fixtureRoot("board-init-dry-run-");

    const result = await initializeRepository({
      root,
      includeUntracked: true,
      mode: "dry-run"
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("dry-run");
    expect(result.filesWritten).toEqual([]);
    expect(result.filesToCreate).toEqual([".board/repository.yaml"]);
    await expect(stat(join(root, ".board"))).rejects.toThrow();
    expect(result.workflowSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "apply-artifact-proposal",
          status: "pending",
          summary: "Dry-run mode did not write files."
        })
      ])
    );
  });

  it("write mode creates the repository contract through safe artifact writes", async () => {
    const root = await fixtureRoot("board-init-write-");

    const result = await initializeRepository({
      root,
      includeUntracked: true,
      mode: "write"
    });

    expect(result.ok).toBe(true);
    expect(result.filesWritten).toEqual([".board", ".board/repository.yaml"]);
    await expect(readFile(join(root, ".board/repository.yaml"), "utf8")).resolves.toContain(
      "repository:"
    );
    expect(result.workflowSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "apply-artifact-proposal",
          status: "completed"
        })
      ])
    );
  });

  it("write mode updates an existing valid contract and preserves maintainer fields", async () => {
    const root = await fixtureRoot("board-init-write-update-");
    await mkdir(join(root, ".board"));
    await writeFile(
      join(root, ".board/repository.yaml"),
      [
        "version: 1",
        "repository:",
        "  name: mode-repo",
        "  type: service",
        "  primary_language: javascript",
        "  purpose: Keep this purpose.",
        ""
      ].join("\n"),
      "utf8"
    );

    const result = await initializeRepository({
      root,
      includeUntracked: true,
      mode: "write"
    });
    const written = await readFile(join(root, ".board/repository.yaml"), "utf8");

    expect(result.ok).toBe(true);
    expect(result.filesWritten).toEqual([".board", ".board/repository.yaml"]);
    expect(result.filesToUpdate).toEqual([".board/repository.yaml"]);
    expect(written).toContain("purpose: Keep this purpose.");
    expect(written).toContain("applications:");
  });
});

async function fixtureRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));

  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "mode-repo",
      scripts: {
        test: "vitest run"
      },
      dependencies: {
        express: "^5.0.0"
      }
    }),
    "utf8"
  );

  return root;
}
