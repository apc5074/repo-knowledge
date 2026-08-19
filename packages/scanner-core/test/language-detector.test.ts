import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildFileInventory, createLanguageDetector, scanRepository } from "../src/index.js";

describe("language detector", () => {
  it("detects TypeScript as primary from tsconfig and source files", async () => {
    const root = await createFixture({
      "package.json": "{}\n",
      "src/index.ts": "export const value = 1;\n",
      "tsconfig.json": "{}\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["package.json", "src/index.ts", "tsconfig.json"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createLanguageDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        language: "javascript",
        files: 0,
        primary: false
      },
      {
        language: "typescript",
        files: 1,
        primary: true
      }
    ]);
    expect(result.facts.find((fact) => fact.value.language === "typescript")).toMatchObject({
      confidence: "high",
      evidence: [
        expect.objectContaining({
          source_path: "tsconfig.json"
        })
      ]
    });
  });

  it("detects mixed Python and Go repositories from manifests", async () => {
    const root = await createFixture({
      "go.mod": "module example\n",
      "pyproject.toml": '[project]\nname = "api"\n',
      "src/main.py": "print('hello')\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["go.mod", "pyproject.toml", "src/main.py"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createLanguageDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        language: "go",
        files: 0,
        primary: false
      },
      {
        language: "python",
        files: 1,
        primary: true
      }
    ]);
    expect(result.facts.map((fact) => fact.confidence)).toEqual(["high", "high"]);
  });

  it("detects JavaScript from source files when no manifest exists", async () => {
    const root = await createFixture({
      "src/index.js": "module.exports = {}\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["src/index.js"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createLanguageDetector()]
    });

    expect(result.facts).toEqual([
      expect.objectContaining({
        confidence: "medium",
        value: {
          language: "javascript",
          files: 1,
          primary: true
        }
      })
    ]);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-lang-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
