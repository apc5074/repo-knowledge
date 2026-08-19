import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createEnvFileDetector,
  parseEnvExampleFile,
  scanRepository
} from "../src/index.js";

describe("Environment file detector", () => {
  it("parses variable names from safe env example files without values", () => {
    const result = parseEnvExampleFile(
      ".env.example",
      [
        "# Example environment",
        "PUBLIC_URL=https://example.com",
        "API_KEY=not-real",
        "export DATABASE_URL=postgres://secret",
        "OPTIONAL_FLAG"
      ].join("\n")
    );

    expect(result).toEqual({
      path: ".env.example",
      variables: [
        {
          name: "PUBLIC_URL",
          secret: false,
          required: true,
          line: 2
        },
        {
          name: "API_KEY",
          secret: true,
          required: true,
          line: 3
        },
        {
          name: "DATABASE_URL",
          secret: true,
          required: true,
          line: 4
        },
        {
          name: "OPTIONAL_FLAG",
          secret: false,
          required: true,
          line: 5
        }
      ]
    });
  });

  it("emits env variable facts with redacted evidence excerpts", async () => {
    const root = await createFixture({
      "apps/api/.env.sample": "PUBLIC_URL=https://example.com\nSESSION_SECRET=not-real\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["apps/api/.env.sample"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createEnvFileDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        name: "PUBLIC_URL",
        source: "env-example",
        secret: false,
        required: true
      },
      {
        name: "SESSION_SECRET",
        source: "env-example",
        secret: true,
        required: true
      }
    ]);
    expect(result.facts.map((fact) => fact.evidence[0]?.excerpt)).toEqual([
      "PUBLIC_URL",
      "SESSION_SECRET"
    ]);
    expect(JSON.stringify(result.facts)).not.toContain("not-real");
    expect(JSON.stringify(result.facts)).not.toContain("https://example.com");
  });

  it("does not read real .env files through the default inventory policy", async () => {
    const root = await createFixture({
      ".env": "DATABASE_URL=postgres://secret",
      ".env.example": "DATABASE_URL=postgres://example"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: [".env", ".env.example"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createEnvFileDetector()]
    });

    expect(inventory.files).toEqual([".env.example"]);
    expect(result.facts).toHaveLength(1);
    expect(JSON.stringify(result.facts)).not.toContain("postgres://secret");
    expect(JSON.stringify(result.facts)).not.toContain("postgres://example");
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-env-file-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
