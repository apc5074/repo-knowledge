import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createDockerfileDetector,
  parseDockerfile,
  scanRepository
} from "../src/index.js";

describe("Dockerfile detector", () => {
  it("parses Dockerfile runtime metadata", () => {
    expect(
      parseDockerfile(
        "Dockerfile",
        [
          "FROM node:22-alpine AS base",
          "WORKDIR /app",
          "COPY package.json pnpm-lock.yaml ./",
          "EXPOSE 3000 9229/tcp",
          'ENTRYPOINT ["node"]',
          'CMD ["dist/index.js"]'
        ].join("\n")
      )
    ).toEqual({
      path: "Dockerfile",
      baseImages: ["node:22-alpine"],
      stages: ["base"],
      exposedPorts: [3000, 9229],
      workdir: "/app",
      command: '["dist/index.js"]',
      entrypoint: '["node"]',
      copiedManifests: ["package.json", "pnpm-lock.yaml"]
    });
  });

  it("emits Dockerfile and runtime command facts", async () => {
    const root = await createFixture({
      Dockerfile: [
        "FROM python:3.13-slim",
        "WORKDIR /app",
        "COPY pyproject.toml uv.lock ./",
        "EXPOSE 8000",
        "CMD uvicorn api.main:app"
      ].join("\n")
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["Dockerfile"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createDockerfileDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        path: "Dockerfile",
        baseImage: "python:3.13-slim",
        baseImages: ["python:3.13-slim"],
        stages: [],
        exposedPorts: [8000],
        workdir: "/app",
        command: "uvicorn api.main:app",
        entrypoint: undefined,
        copiedManifests: ["pyproject.toml", "uv.lock"]
      },
      {
        name: "docker-cmd",
        command: "uvicorn api.main:app",
        category: "runtime",
        cwd: "."
      }
    ]);
    expect(result.facts[0]).toMatchObject({
      kind: "dockerfile.detected",
      evidence: [
        expect.objectContaining({
          source_path: "Dockerfile",
          line_start: 1
        })
      ]
    });
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-dockerfile-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
