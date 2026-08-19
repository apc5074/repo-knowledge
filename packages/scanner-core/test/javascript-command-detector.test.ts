import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createJavaScriptCommandDetector,
  scanRepository
} from "../src/index.js";

describe("JavaScript command detector", () => {
  it("maps common package scripts to normalized purposes", async () => {
    const root = await createFixture({
      "package.json": JSON.stringify(
        {
          packageManager: "pnpm@10.0.0",
          scripts: {
            dev: "vite",
            build: "vite build",
            test: "vitest run",
            lint: "eslint .",
            typecheck: "tsc --noEmit",
            "db:migrate": "prisma migrate deploy",
            "db:seed": "tsx prisma/seed.ts",
            healthcheck: "node scripts/healthcheck.js",
            preview: "vite preview"
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
      detectors: [createJavaScriptCommandDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      command("build", "vite build", "build"),
      command("db:migrate", "prisma migrate deploy", "migration"),
      command("db:seed", "tsx prisma/seed.ts", "seed"),
      command("dev", "vite", "development"),
      command("healthcheck", "node scripts/healthcheck.js", "healthcheck"),
      command("lint", "eslint .", "lint"),
      command("test", "vitest run", "test"),
      command("typecheck", "tsc --noEmit", "typecheck")
    ]);
    expect(result.facts.every((fact) => fact.kind === "command.detected")).toBe(true);
    expect(result.facts[0]?.evidence[0]).toMatchObject({
      source_path: "package.json"
    });
  });

  it("represents monorepo package commands with package working directories", async () => {
    const root = await createFixture({
      "apps/web/package.json": JSON.stringify({
        scripts: {
          dev: "next dev"
        }
      }),
      "packages/api/package.json": JSON.stringify({
        scripts: {
          start: "node dist/index.js"
        }
      })
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["apps/web/package.json", "packages/api/package.json"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createJavaScriptCommandDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        name: "dev",
        command: "next dev",
        category: "development",
        cwd: "apps/web",
        packageManager: undefined
      },
      {
        name: "start",
        command: "node dist/index.js",
        category: "start",
        cwd: "packages/api",
        packageManager: undefined
      }
    ]);
  });
});

function command(name: string, commandValue: string, category: string): Record<string, unknown> {
  return {
    name,
    command: commandValue,
    category,
    cwd: ".",
    packageManager: "pnpm"
  };
}

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-js-command-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
