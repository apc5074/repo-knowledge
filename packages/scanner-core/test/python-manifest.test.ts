import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createPythonManifestDetector,
  parsePythonManifest,
  scanRepository
} from "../src/index.js";

describe("Python manifest parser", () => {
  it("parses pyproject project metadata and dependencies", () => {
    const result = parsePythonManifest(
      "pyproject.toml",
      [
        "[project]",
        'name = "api"',
        'dependencies = ["fastapi>=0.110", "asyncpg", "redis"]',
        "",
        "[project.optional-dependencies]",
        'dev = ["pytest", "ruff"]',
        "",
        "[tool.poetry]",
        "",
        "[dependency-groups]",
        'dev = ["mypy"]'
      ].join("\n")
    );

    expect(result).toEqual({
      ok: true,
      manifest: {
        path: "pyproject.toml",
        projectName: "api",
        dependencies: ["fastapi", "asyncpg", "redis"],
        optionalDependencies: {
          dev: ["pytest", "ruff"]
        },
        toolHints: ["tool.poetry"]
      }
    });
  });

  it("parses requirements files and warns on malformed requirements", () => {
    expect(parsePythonManifest("requirements.txt", "fastapi>=0.110\n-r dev.txt\n")).toEqual({
      ok: true,
      manifest: {
        path: "requirements.txt",
        dependencies: ["fastapi"],
        optionalDependencies: {},
        toolHints: []
      }
    });
    expect(parsePythonManifest("requirements.txt", "==broken\n")).toEqual(
      expect.objectContaining({
        ok: false,
        warning: expect.objectContaining({
          path: "requirements.txt"
        })
      })
    );
  });

  it("emits package manager, framework, database, cache, and application facts", async () => {
    const root = await createFixture({
      "poetry.lock": "# lock\n",
      "pyproject.toml": [
        "[project]",
        'name = "api"',
        'dependencies = ["fastapi", "django", "celery", "sqlalchemy", "redis"]',
        "",
        "[project.optional-dependencies]",
        'dev = ["pytest"]',
        "",
        "[tool.poetry]"
      ].join("\n"),
      "requirements.txt": "flask\npsycopg2-binary\n",
      "uv.lock": "version = 1\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["pyproject.toml", "requirements.txt", "poetry.lock", "uv.lock"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createPythonManifestDetector()]
    });

    expect(result.warnings).toEqual([]);
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "application.detected",
          value: {
            name: "api",
            path: ".",
            kind: "python-package"
          }
        }),
        expect.objectContaining({
          kind: "package_manager.detected",
          value: {
            name: "poetry",
            primary: true
          }
        }),
        expect.objectContaining({
          kind: "package_manager.detected",
          value: {
            name: "uv",
            primary: true
          }
        }),
        expect.objectContaining({
          kind: "package_manager.detected",
          value: {
            name: "pip",
            primary: false
          }
        }),
        expect.objectContaining({
          kind: "framework.detected",
          value: {
            name: "FastAPI",
            language: "python",
            package: "fastapi"
          }
        }),
        expect.objectContaining({
          kind: "framework.detected",
          value: {
            name: "pytest",
            language: "python",
            package: "pytest"
          }
        }),
        expect.objectContaining({
          kind: "database.dependency_detected",
          value: {
            name: "database",
            kind: "database",
            package: "sqlalchemy"
          }
        }),
        expect.objectContaining({
          kind: "cache.dependency_detected",
          value: {
            name: "redis",
            package: "redis"
          }
        })
      ])
    );
  });

  it("returns recoverable warnings for likely malformed pyproject TOML", async () => {
    const root = await createFixture({
      "pyproject.toml": '[project]\nname = "api\n'
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["pyproject.toml"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createPythonManifestDetector()]
    });

    expect(result.facts).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        detector: "python-manifest",
        path: "pyproject.toml"
      })
    ]);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-python-manifest-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
