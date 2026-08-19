import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createJavaScriptFrameworkDetector,
  scanRepository
} from "../src/index.js";

describe("JavaScript framework detector", () => {
  it("detects common frameworks from package dependencies", async () => {
    const root = await createFixture({
      "package.json": JSON.stringify(
        {
          name: "app",
          dependencies: {
            "@nestjs/core": "^11.0.0",
            express: "^5.0.0",
            fastify: "^5.0.0",
            next: "^15.0.0",
            react: "^19.0.0"
          },
          devDependencies: {
            vite: "^7.0.0"
          }
        },
        null,
        2
      )
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["package.json"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createJavaScriptFrameworkDetector()]
    });
    const frameworkFacts = result.facts.filter((fact) => fact.kind === "framework.detected");

    expect(frameworkFacts.map((fact) => fact.value)).toEqual([
      framework("express", "express", "^5.0.0"),
      framework("fastify", "fastify", "^5.0.0"),
      framework("nestjs", "@nestjs/core", "^11.0.0"),
      framework("next.js", "next", "^15.0.0"),
      framework("react", "react", "^19.0.0"),
      framework("vite", "vite", "^7.0.0")
    ]);
    expect(frameworkFacts.every((fact) => fact.confidence === "high")).toBe(true);
    expect(frameworkFacts[0]?.evidence[0]).toMatchObject({
      source_path: "package.json"
    });
  });

  it("detects CLI and worker application candidates from bin and scripts", async () => {
    const root = await createFixture({
      "tools/cli/package.json": JSON.stringify(
        {
          name: "cli",
          bin: {
            board: "./dist/index.js"
          },
          scripts: {
            worker: "node dist/worker.js"
          }
        },
        null,
        2
      )
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["tools/cli/package.json"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createJavaScriptFrameworkDetector()]
    });

    expect(
      result.facts.filter((fact) => fact.kind === "framework.detected").map((fact) => fact.value)
    ).toEqual([
      {
        name: "node-cli",
        language: "javascript",
        version: undefined,
        package: undefined
      },
      {
        name: "node-worker",
        language: "javascript",
        version: undefined,
        package: undefined
      }
    ]);
    expect(
      result.facts.filter((fact) => fact.kind === "application.detected").map((fact) => fact.value)
    ).toEqual([
      {
        name: "cli",
        path: "tools/cli",
        kind: "cli",
        framework: "node-cli"
      },
      {
        name: "cli",
        path: "tools/cli",
        kind: "worker",
        framework: "node-worker"
      }
    ]);
  });

  it("uses config files as medium-confidence framework signals", async () => {
    const root = await createFixture({
      "apps/web/package.json": JSON.stringify({
        name: "web"
      }),
      "apps/web/vite.config.ts": "export default {}\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["apps/web/package.json", "apps/web/vite.config.ts"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createJavaScriptFrameworkDetector()]
    });

    expect(result.facts).toEqual([
      expect.objectContaining({
        kind: "framework.detected",
        confidence: "medium",
        value: {
          name: "vite",
          language: "javascript",
          version: undefined,
          package: undefined
        }
      }),
      expect.objectContaining({
        kind: "application.detected",
        confidence: "medium",
        value: {
          name: "web",
          path: "apps/web",
          kind: "frontend-app",
          framework: "vite"
        }
      })
    ]);
  });
});

function framework(name: string, packageName: string, version: string): Record<string, unknown> {
  return {
    name,
    language: "javascript",
    version,
    package: packageName
  };
}

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-js-framework-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
