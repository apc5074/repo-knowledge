import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createDocumentationDetector,
  parseRepoSkill,
  scanRepository
} from "../src/index.js";

describe("Documentation detector", () => {
  it("parses repo skill names and referenced resources", () => {
    expect(
      parseRepoSkill(
        ".board/skills/context/SKILL.md",
        "# Context\nRead references/architecture.md and assets/diagram.png."
      )
    ).toEqual({
      name: "context",
      path: ".board/skills/context/SKILL.md",
      referencedPaths: ["assets/diagram.png", "references/architecture.md"]
    });
  });

  it("detects documentation, agent instructions, and repo skills without changing docs", async () => {
    const root = await createFixture({
      "README.md": "# Board\n",
      "docs/setup.md": "# Setup\n",
      "AGENTS.md": "# Agent Instructions\n",
      ".github/copilot-instructions.md": "# Copilot\n",
      ".board/skills/repo-context/SKILL.md": "# Repo Context\nSee references/contracts.md.\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: [
        "README.md",
        "docs/setup.md",
        "AGENTS.md",
        ".github/copilot-instructions.md",
        ".board/skills/repo-context/SKILL.md"
      ]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createDocumentationDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "documentation.detected",
          value: {
            path: "README.md",
            title: "Board",
            docType: "readme"
          }
        }),
        expect.objectContaining({
          kind: "documentation.detected",
          value: {
            path: "docs/setup.md",
            title: "Setup",
            docType: "docs"
          }
        }),
        expect.objectContaining({
          kind: "agent_instruction.detected",
          value: {
            path: "AGENTS.md",
            tool: "agents",
            scope: "."
          }
        }),
        expect.objectContaining({
          kind: "agent_instruction.detected",
          value: {
            path: ".github/copilot-instructions.md",
            tool: "copilot",
            scope: ".github"
          }
        }),
        expect.objectContaining({
          kind: "repo_skill.detected",
          value: expect.objectContaining({
            name: "repo-context",
            path: ".board/skills/repo-context/SKILL.md",
            referencedPaths: ["references/contracts.md"]
          })
        })
      ])
    );
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-documentation-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
