import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ArtifactWriteConflictError, writeArtifactProposals } from "../src/index.js";

describe("safe artifact writer", () => {
  it("creates directories and new file artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-init-writer-create-"));
    const result = await writeArtifactProposals({
      repositoryRoot: root,
      artifacts: [
        {
          path: ".board",
          action: "create"
        },
        {
          path: ".board/repository.yaml",
          action: "create",
          content: "version: 1\n"
        }
      ]
    });

    expect(result.written).toEqual([".board", ".board/repository.yaml"]);
    await expect(readFile(join(root, ".board/repository.yaml"), "utf8")).resolves.toBe(
      "version: 1\n"
    );
  });

  it("refuses to overwrite create artifacts without force", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-init-writer-conflict-"));
    await mkdir(join(root, ".board"));
    await writeFile(join(root, ".board/repository.yaml"), "existing\n", "utf8");

    await expect(
      writeArtifactProposals({
        repositoryRoot: root,
        artifacts: [
          {
            path: ".board/repository.yaml",
            action: "create",
            content: "new\n"
          }
        ]
      })
    ).rejects.toBeInstanceOf(ArtifactWriteConflictError);
    await expect(readFile(join(root, ".board/repository.yaml"), "utf8")).resolves.toBe(
      "existing\n"
    );
  });

  it("updates existing files atomically and preserves mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-init-writer-update-"));
    await mkdir(join(root, ".board"));
    const path = join(root, ".board/repository.yaml");
    await writeFile(path, "old\n", { encoding: "utf8", mode: 0o640 });

    const result = await writeArtifactProposals({
      repositoryRoot: root,
      artifacts: [
        {
          path: ".board/repository.yaml",
          action: "update",
          content: "new\n"
        }
      ]
    });

    expect(result.written).toEqual([".board/repository.yaml"]);
    await expect(readFile(path, "utf8")).resolves.toBe("new\n");
    expect((await stat(path)).mode & 0o777).toBe(0o640);
  });

  it("skips deferred unchanged and skip artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-init-writer-skip-"));
    const result = await writeArtifactProposals({
      repositoryRoot: root,
      artifacts: [
        {
          path: "AGENTS.md",
          action: "deferred"
        },
        {
          path: ".board/repository.yaml",
          action: "unchanged"
        },
        {
          path: "broken.yaml",
          action: "skip"
        }
      ]
    });

    expect(result).toEqual({
      written: [],
      skipped: ["AGENTS.md", ".board/repository.yaml", "broken.yaml"]
    });
  });
});
