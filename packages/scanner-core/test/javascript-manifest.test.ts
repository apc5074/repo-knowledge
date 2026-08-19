import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createJavaScriptManifestDetector,
  parseJavaScriptPackageManifest,
  parseTypeScriptConfig,
  scanRepository
} from "../src/index.js";

describe("JavaScript and TypeScript manifest parsing", () => {
  it("parses scripts, dependencies, package manager, module type, and workspaces", () => {
    const result = parseJavaScriptPackageManifest(
      "package.json",
      JSON.stringify({
        name: "app",
        type: "module",
        packageManager: "pnpm@10.0.0",
        scripts: {
          dev: "vite",
          test: "vitest"
        },
        dependencies: {
          react: "^19.0.0"
        },
        devDependencies: {
          typescript: "^5.0.0"
        },
        workspaces: ["apps/*", "packages/*"]
      })
    );

    expect(result).toEqual({
      ok: true,
      manifest: {
        path: "package.json",
        name: "app",
        main: undefined,
        bin: [],
        exports: [],
        moduleType: "module",
        packageManager: "pnpm@10.0.0",
        scripts: {
          dev: "vite",
          test: "vitest"
        },
        dependencies: {
          react: "^19.0.0"
        },
        devDependencies: {
          typescript: "^5.0.0"
        },
        workspaces: ["apps/*", "packages/*"]
      }
    });
  });

  it("parses npm workspace object shape", () => {
    const result = parseJavaScriptPackageManifest(
      "package.json",
      JSON.stringify({
        workspaces: {
          packages: ["apps/*"]
        }
      })
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        manifest: expect.objectContaining({
          workspaces: ["apps/*"]
        })
      })
    );
  });

  it("returns warnings for invalid package and TypeScript config JSON", () => {
    expect(parseJavaScriptPackageManifest("package.json", "{")).toEqual(
      expect.objectContaining({
        ok: false,
        warning: expect.objectContaining({
          detector: "javascript-manifest",
          path: "package.json"
        })
      })
    );
    expect(parseTypeScriptConfig("tsconfig.json", "{")).toEqual(
      expect.objectContaining({
        ok: false,
        warning: expect.objectContaining({
          detector: "javascript-manifest",
          path: "tsconfig.json"
        })
      })
    );
  });

  it("emits application and command facts from package manifests", async () => {
    const root = await createFixture({
      "apps/web/package.json": JSON.stringify(
        {
          name: "web",
          type: "module",
          scripts: {
            build: "vite build",
            dev: "vite"
          },
          dependencies: {
            vite: "^7.0.0"
          }
        },
        null,
        2
      ),
      "apps/web/tsconfig.json": "{}\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["apps/web/package.json", "apps/web/tsconfig.json"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createJavaScriptManifestDetector()]
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.facts).toEqual([
      expect.objectContaining({
        kind: "application.detected",
        value: expect.objectContaining({
          name: "web",
          path: "apps/web",
          kind: "node-package",
          moduleType: "module"
        })
      }),
      expect.objectContaining({
        kind: "command.detected",
        value: {
          name: "build",
          command: "vite build",
          category: "build",
          cwd: "apps/web"
        }
      }),
      expect.objectContaining({
        kind: "command.detected",
        value: {
          name: "dev",
          command: "vite",
          category: "run",
          cwd: "apps/web"
        }
      })
    ]);
  });

  it("emits scanner warnings for invalid manifests without executing scripts", async () => {
    const root = await createFixture({
      "package.json": "{",
      "tsconfig.json": "{"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["package.json", "tsconfig.json"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createJavaScriptManifestDetector()]
    });

    expect(result.facts).toEqual([]);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.every((warning) => warning.detector === "javascript-manifest")).toBe(
      true
    );
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-js-manifest-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
