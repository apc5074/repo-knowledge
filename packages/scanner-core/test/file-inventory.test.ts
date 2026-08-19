import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { buildFileInventory, createInventoryReader } from "../src/index.js";

describe("file inventory", () => {
  it("builds deterministic git-backed metadata and excludes untracked files by default", async () => {
    const root = await createFixture({
      "README.md": "# Example\n",
      "package.json": "{}\n",
      "scratch.ts": "console.log('untracked');\n",
      "src/index.ts": "export const value = 1;\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["src/index.ts", "README.md", "package.json"]
    });

    expect(inventory.source).toBe("git");
    expect(inventory.files).toEqual(["package.json", "README.md", "src/index.ts"]);
    expect(inventory.files).not.toContain("scratch.ts");
    expect(inventory.entries).toEqual([
      expect.objectContaining({
        path: "package.json",
        category: "config",
        manifest: true,
        content_safe: true
      }),
      expect.objectContaining({
        path: "README.md",
        category: "documentation",
        manifest: true,
        content_safe: true
      }),
      expect.objectContaining({
        path: "src/index.ts",
        category: "code",
        manifest: false,
        content_safe: true
      })
    ]);
  });

  it("applies safety skips to tracked sensitive, binary, and large files", async () => {
    const root = await createFixture({
      ".env": "SECRET=value\n",
      "asset.png": "fake-binary",
      "large.sql": "select 1;\n"
    });
    const inventory = await buildFileInventory({
      root,
      maxFileSizeBytes: 4,
      trackedFiles: [".env", "asset.png", "large.sql"]
    });

    expect(inventory.files).toEqual(["asset.png", "large.sql"]);
    expect(inventory.entries?.find((entry) => entry.path === "asset.png")).toMatchObject({
      category: "binary",
      content_safe: false,
      skip_reason: "binary file"
    });
    expect(inventory.entries?.find((entry) => entry.path === "large.sql")).toMatchObject({
      category: "code",
      content_safe: false,
      skip_reason: "file exceeds scan size limit"
    });
    expect(inventory.warnings).toHaveLength(2);
  });

  it("walks the filesystem fallback while skipping ignored directories", async () => {
    const root = await createFixture({
      "node_modules/pkg/index.js": "module.exports = {}\n",
      "src/index.ts": "export const value = 1;\n"
    });
    const inventory = await buildFileInventory({
      root,
      includeUntracked: true
    });

    expect(inventory.source).toBe("filesystem");
    expect(inventory.files).toEqual(["src/index.ts"]);
  });

  it("caches lazy reads for one inventory reader", async () => {
    const inventory = {
      root: "/tmp/example",
      files: ["src/index.ts"],
      entries: [
        {
          path: "src/index.ts",
          absolutePath: "/tmp/example/src/index.ts",
          extension: ".ts",
          size_bytes: 23,
          category: "code" as const,
          manifest: false,
          content_safe: true
        }
      ]
    };
    let readCount = 0;
    const reader = createInventoryReader(inventory, {
      readFileText: async () => {
        readCount += 1;
        return "export const value = 1;\n";
      }
    });

    await expect(reader.readText("src/index.ts")).resolves.toContain("value");
    await expect(reader.readText("src/index.ts")).resolves.toContain("value");
    expect(readCount).toBe(1);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
