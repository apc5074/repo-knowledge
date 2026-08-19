import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildFileInventory, createPackageManagerDetector, scanRepository } from "../src/index.js";

describe("package manager detector", () => {
  it("detects JavaScript package managers from manifest and lockfiles", async () => {
    const root = await createFixture({
      "package.json": JSON.stringify({ packageManager: "pnpm@10.1.0" }, null, 2),
      "package-lock.json": "{}\n",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "yarn.lock": "# yarn lockfile\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createPackageManagerDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        name: "npm",
        version: undefined,
        primary: false
      },
      {
        name: "pnpm",
        version: "10.1.0",
        primary: true
      },
      {
        name: "yarn",
        version: undefined,
        primary: false
      }
    ]);
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "package_manager.detected",
          confidence: "high",
          evidence: [
            expect.objectContaining({
              source_path: "package.json",
              line_start: 2
            })
          ]
        })
      ])
    );
  });

  it("detects Python package managers from lockfiles and project files", async () => {
    const root = await createFixture({
      "pyproject.toml": '[tool.poetry]\nname = "api"\n[dependency-groups]\ndev = []\n',
      "poetry.lock": "# poetry\n",
      "requirements.in": "flask\n",
      "requirements.txt": "flask==3.0.0\n",
      "uv.lock": "version = 1\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: [
        "pyproject.toml",
        "poetry.lock",
        "requirements.in",
        "requirements.txt",
        "uv.lock"
      ]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createPackageManagerDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        name: "pip",
        version: undefined,
        primary: false
      },
      {
        name: "pip-tools",
        version: undefined,
        primary: false
      },
      {
        name: "poetry",
        version: undefined,
        primary: true
      },
      {
        name: "uv",
        version: undefined,
        primary: true
      }
    ]);
    expect(result.facts.map((fact) => fact.confidence)).toEqual([
      "medium",
      "medium",
      "high",
      "high"
    ]);
  });

  it("does not fail the scan on unreadable or malformed package manifests", async () => {
    const root = await createFixture({
      "package.json": "{ invalid json",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["package.json", "pnpm-lock.yaml"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createPackageManagerDetector()]
    });

    expect(result.errors).toEqual([]);
    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        name: "pnpm",
        version: undefined,
        primary: false
      }
    ]);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-pm-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
