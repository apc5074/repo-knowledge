import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createJavaScriptEntrypointDetector,
  scanRepository
} from "../src/index.js";

describe("JavaScript entrypoint detector", () => {
  it("detects API and worker entrypoints from manifest fields and scripts", async () => {
    const root = await createFixture({
      "package.json": JSON.stringify(
        {
          name: "api",
          main: "./dist/server.js",
          scripts: {
            start: "node src/server.ts",
            worker: "tsx src/worker.ts"
          }
        },
        null,
        2
      ),
      "src/server.ts": "export {}\n",
      "src/worker.ts": "export {}\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["package.json", "src/server.ts", "src/worker.ts"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createJavaScriptEntrypointDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        path: "dist/server.js",
        runtime: "node",
        command: undefined,
        application: "api"
      },
      {
        path: "src/server.ts",
        runtime: "node",
        command: "node src/server.ts",
        application: "api"
      },
      {
        path: "src/worker.ts",
        runtime: "node",
        command: "tsx src/worker.ts",
        application: "api"
      }
    ]);
    expect(result.facts[0]).toMatchObject({
      kind: "entrypoint.detected",
      confidence: "high",
      evidence: [
        expect.objectContaining({
          source_path: "package.json"
        })
      ]
    });
  });

  it("detects frontend and CLI entrypoints", async () => {
    const root = await createFixture({
      "apps/web/package.json": JSON.stringify({
        name: "web"
      }),
      "apps/web/src/main.tsx": "export {}\n",
      "tools/cli/package.json": JSON.stringify({
        name: "cli",
        bin: {
          board: "./src/index.ts"
        }
      }),
      "tools/cli/src/index.ts": "export {}\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: [
        "apps/web/package.json",
        "apps/web/src/main.tsx",
        "tools/cli/package.json",
        "tools/cli/src/index.ts"
      ]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createJavaScriptEntrypointDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        path: "apps/web/src/main.tsx",
        runtime: "browser",
        command: undefined,
        application: "web"
      },
      {
        path: "tools/cli/src/index.ts",
        runtime: "node",
        command: undefined,
        application: "cli"
      }
    ]);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-js-entrypoint-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
