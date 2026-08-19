import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createDevContainerDetector,
  parseDevContainerConfig,
  scanRepository
} from "../src/index.js";

describe("Dev Container detector", () => {
  it("parses JSONC config with Dockerfile references and lifecycle commands", () => {
    const result = parseDevContainerConfig(
      ".devcontainer/devcontainer.json",
      [
        "{",
        "  // comments are common in devcontainer configs",
        '  "name": "Board",',
        '  "dockerFile": "../Dockerfile",',
        '  "features": {',
        '    "ghcr.io/devcontainers/features/node:1": {}',
        "  },",
        '  "postCreateCommand": "pnpm install",',
        '  "postStartCommand": ["pnpm", "dev"],',
        '  "forwardPorts": [3000, "5432",],',
        '  "workspaceFolder": "/workspaces/board",',
        "}"
      ].join("\n")
    );

    expect(result).toEqual({
      ok: true,
      devcontainer: {
        path: ".devcontainer/devcontainer.json",
        name: "Board",
        image: undefined,
        dockerFile: "../Dockerfile",
        dockerComposeFile: undefined,
        features: ["ghcr.io/devcontainers/features/node:1"],
        postCreateCommand: "pnpm install",
        postStartCommand: "pnpm && dev",
        forwardPorts: [3000, 5432],
        service: undefined,
        workspaceFolder: "/workspaces/board"
      }
    });
  });

  it("emits Dev Container facts and setup commands for Dockerfile configs", async () => {
    const root = await createFixture({
      ".devcontainer/devcontainer.json": [
        "{",
        '  "name": "Board",',
        '  "dockerFile": "../Dockerfile",',
        '  "postCreateCommand": "pnpm install",',
        '  "forwardPorts": [3000]',
        "}"
      ].join("\n")
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: [".devcontainer/devcontainer.json"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createDevContainerDetector()]
    });

    expect(result.warnings).toEqual([]);
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "devcontainer.detected",
          value: expect.objectContaining({
            path: ".devcontainer/devcontainer.json",
            name: "Board",
            dockerFile: "../Dockerfile",
            forwardPorts: [3000]
          })
        }),
        expect.objectContaining({
          kind: "command.detected",
          value: {
            name: "postCreateCommand",
            command: "pnpm install",
            category: "setup",
            cwd: ".devcontainer"
          }
        })
      ])
    );
  });

  it("emits Compose-backed Dev Container service facts", async () => {
    const root = await createFixture({
      ".devcontainer/api/devcontainer.json": [
        "{",
        '  "name": "API",',
        '  "dockerComposeFile": ["../compose.yml"],',
        '  "service": "api",',
        '  "workspaceFolder": "/workspace"',
        "}"
      ].join("\n")
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: [".devcontainer/api/devcontainer.json"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createDevContainerDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "devcontainer.detected",
          value: expect.objectContaining({
            dockerComposeFile: ["../compose.yml"],
            service: "api"
          })
        }),
        expect.objectContaining({
          kind: "service.detected",
          value: {
            name: "api",
            kind: "devcontainer-service",
            source: "devcontainer"
          }
        })
      ])
    );
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-devcontainer-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
