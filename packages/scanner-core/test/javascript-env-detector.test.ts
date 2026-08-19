import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createJavaScriptEnvDetector,
  isSecretLikeEnvName,
  scanRepository
} from "../src/index.js";

describe("JavaScript environment variable detector", () => {
  it("detects process.env references from JS and TS files", async () => {
    const root = await createFixture({
      "src/config.ts": [
        "const url = process.env.DATABASE_URL;",
        "const token = process.env['API_TOKEN'];",
        "const mode = process.env.NODE_ENV;"
      ].join("\n")
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["src/config.ts"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createJavaScriptEnvDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        name: "DATABASE_URL",
        source: "source",
        secret: true
      },
      {
        name: "API_TOKEN",
        source: "source",
        secret: true
      },
      {
        name: "NODE_ENV",
        source: "source",
        secret: false
      }
    ]);
    expect(result.facts[0]?.evidence[0]).toMatchObject({
      source_path: "src/config.ts",
      line_start: 1
    });
  });

  it("detects env example variable names without exposing values", async () => {
    const root = await createFixture({
      ".env.example": "PUBLIC_URL=https://example.com\nAPI_KEY=not-real\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: [".env.example"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createJavaScriptEnvDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        name: "PUBLIC_URL",
        source: "env-example",
        secret: false
      },
      {
        name: "API_KEY",
        source: "env-example",
        secret: true
      }
    ]);
    expect(result.facts.map((fact) => fact.evidence[0]?.excerpt)).toEqual([
      "PUBLIC_URL",
      "API_KEY"
    ]);
  });

  it("classifies secret-looking names", () => {
    expect(isSecretLikeEnvName("SESSION_SECRET")).toBe(true);
    expect(isSecretLikeEnvName("DATABASE_URL")).toBe(true);
    expect(isSecretLikeEnvName("PUBLIC_URL")).toBe(false);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-js-env-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
