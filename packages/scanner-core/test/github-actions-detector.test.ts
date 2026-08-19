import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createGitHubActionsDetector,
  parseGitHubActionsWorkflow,
  scanRepository
} from "../src/index.js";

describe("GitHub Actions detector", () => {
  it("parses Node workflow triggers, setup actions, versions, and commands", () => {
    const result = parseGitHubActionsWorkflow(
      ".github/workflows/ci.yml",
      [
        "name: CI",
        "on:",
        "  push:",
        "  pull_request:",
        "jobs:",
        "  web:",
        "    name: Web checks",
        "    steps:",
        "      - uses: actions/checkout@v4",
        "      - uses: actions/setup-node@v4",
        "        with:",
        "          node-version: '22'",
        "      - run: pnpm lint",
        "      - run: pnpm test",
        "      - run: pnpm build"
      ].join("\n")
    );

    expect(result).toEqual({
      ok: true,
      workflow: {
        path: ".github/workflows/ci.yml",
        name: "CI",
        triggers: ["pull_request", "push"],
        jobs: [
          {
            id: "web",
            name: "Web checks",
            setupActions: ["actions/setup-node@v4"],
            commands: ["pnpm lint", "pnpm test", "pnpm build"],
            languageVersions: {
              node: "22"
            }
          }
        ]
      }
    });
  });

  it("emits workflow and validation command facts for Node workflows", async () => {
    const root = await createFixture({
      ".github/workflows/ci.yml": [
        "name: CI",
        "on: [push]",
        "jobs:",
        "  checks:",
        "    steps:",
        "      - uses: actions/setup-node@v4",
        "        with:",
        "          node-version: '22'",
        "      - run: pnpm lint",
        "      - run: pnpm typecheck",
        "      - run: pnpm test"
      ].join("\n")
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: [".github/workflows/ci.yml"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createGitHubActionsDetector()]
    });

    expect(result.warnings).toEqual([]);
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ci.workflow_detected",
          value: expect.objectContaining({
            path: ".github/workflows/ci.yml",
            name: "CI",
            triggers: ["push"]
          })
        }),
        expect.objectContaining({
          kind: "command.detected",
          value: expect.objectContaining({
            name: "checks:lint",
            command: "pnpm lint",
            category: "lint",
            source: "github-actions"
          })
        }),
        expect.objectContaining({
          kind: "command.detected",
          value: expect.objectContaining({
            name: "checks:typecheck",
            command: "pnpm typecheck",
            category: "typecheck"
          })
        })
      ])
    );
  });

  it("emits workflow and validation command facts for Python workflows", async () => {
    const root = await createFixture({
      ".github/workflows/python.yaml": [
        "name: Python",
        "on:",
        "  pull_request:",
        "jobs:",
        "  test:",
        "    steps:",
        "      - uses: actions/setup-python@v5",
        "        with:",
        "          python-version: '3.12'",
        "      - run: uv run ruff check python",
        "      - run: uv run mypy python",
        "      - run: uv run pytest"
      ].join("\n")
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: [".github/workflows/python.yaml"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createGitHubActionsDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ci.workflow_detected",
          value: expect.objectContaining({
            path: ".github/workflows/python.yaml",
            triggers: ["pull_request"],
            jobs: [
              expect.objectContaining({
                languageVersions: {
                  python: "3.12"
                }
              })
            ]
          })
        }),
        expect.objectContaining({
          kind: "command.detected",
          value: expect.objectContaining({
            command: "uv run pytest",
            category: "test"
          })
        })
      ])
    );
  });

  it("returns a warning instead of throwing for invalid workflow YAML", async () => {
    const root = await createFixture({
      ".github/workflows/broken.yml": "name: Broken\njobs: ["
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: [".github/workflows/broken.yml"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createGitHubActionsDetector()]
    });

    expect(result.facts).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        detector: "github-actions",
        path: ".github/workflows/broken.yml"
      })
    ]);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-github-actions-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
