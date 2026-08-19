import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createMakefileDetector,
  parseScriptFile,
  scanRepository
} from "../src/index.js";

describe("Makefile and Justfile detector", () => {
  it("parses known Makefile targets conservatively", () => {
    const result = parseScriptFile(
      "Makefile",
      [
        ".PHONY: install test",
        "install bootstrap:",
        "\tpnpm install",
        "test:",
        "\tpnpm test",
        "lint: ## lint project",
        "\tpnpm lint",
        "dist/output:",
        "\tmkdir -p dist",
        "dynamic-%:",
        "\techo dynamic"
      ].join("\n")
    );

    expect(result).toEqual({
      path: "Makefile",
      kind: "makefile",
      targets: [
        {
          name: "install",
          command: "make install",
          category: "setup",
          confidence: "high",
          line: 2
        },
        {
          name: "lint",
          command: "make lint",
          category: "lint",
          confidence: "high",
          line: 6
        },
        {
          name: "test",
          command: "make test",
          category: "test",
          confidence: "high",
          line: 4
        }
      ]
    });
  });

  it("emits command facts for Makefile targets with evidence", async () => {
    const root = await createFixture({
      Makefile: ["install:", "\tpnpm install", "verify:", "\tpnpm verify"].join("\n")
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["Makefile"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createMakefileDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "command.detected",
          value: {
            name: "install",
            command: "make install",
            category: "setup",
            cwd: ".",
            source: "makefile"
          },
          evidence: [
            expect.objectContaining({
              source_path: "Makefile",
              line_start: 1,
              excerpt: "install"
            })
          ]
        }),
        expect.objectContaining({
          value: expect.objectContaining({
            name: "verify",
            command: "make verify",
            category: "verification"
          })
        })
      ])
    );
  });

  it("emits command facts for Justfile recipes", async () => {
    const root = await createFixture({
      justfile: [
        "dev port='3000':",
        "\tpnpm dev --port {{port}}",
        "typecheck:",
        "\tpnpm typecheck"
      ].join("\n")
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["justfile"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createMakefileDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        name: "dev",
        command: "just dev",
        category: "development",
        cwd: ".",
        source: "justfile"
      },
      {
        name: "typecheck",
        command: "just typecheck",
        category: "typecheck",
        cwd: ".",
        source: "justfile"
      }
    ]);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-makefile-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
