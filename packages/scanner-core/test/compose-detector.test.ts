import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildFileInventory, createComposeDetector, parseComposeFile, scanRepository } from "../src/index.js";

describe("Compose detector", () => {
  it("parses services through YAML without env values", () => {
    const result = parseComposeFile(
      "compose.yaml",
      [
        "services:",
        "  api:",
        "    build:",
        "      context: .",
        "    command: pnpm dev",
        "    ports:",
        "      - \"3000:3000\"",
        "    environment:",
        "      DATABASE_URL: postgres://secret",
        "      REDIS_URL: redis://redis:6379",
        "    depends_on:",
        "      db:",
        "        condition: service_healthy",
        "  db:",
        "    image: postgres:16",
        "    ports:",
        "      - \"5432:5432\"",
        "  redis:",
        "    image: redis:7"
      ].join("\n")
    );

    expect(result).toEqual({
      ok: true,
      compose: {
        path: "compose.yaml",
        services: [
          {
            name: "api",
            image: undefined,
            build: ".",
            ports: ["3000:3000"],
            environment: ["DATABASE_URL", "REDIS_URL"],
            dependsOn: ["db"],
            healthcheck: false,
            volumes: [],
            command: "pnpm dev"
          },
          {
            name: "db",
            image: "postgres:16",
            build: undefined,
            ports: ["5432:5432"],
            environment: [],
            dependsOn: [],
            healthcheck: false,
            volumes: [],
            command: undefined
          },
          {
            name: "redis",
            image: "redis:7",
            build: undefined,
            ports: [],
            environment: [],
            dependsOn: [],
            healthcheck: false,
            volumes: [],
            command: undefined
          }
        ]
      }
    });
  });

  it("emits Compose file, service, env-name, command, PostgreSQL, and Redis facts", async () => {
    const root = await createFixture({
      "docker-compose.yml": [
        "services:",
        "  api:",
        "    build: .",
        "    command: pnpm dev",
        "    environment:",
        "      - DATABASE_URL=postgres://secret",
        "      - PUBLIC_URL=http://localhost:3000",
        "    depends_on:",
        "      - db",
        "      - redis",
        "  db:",
        "    image: postgres:16",
        "    ports:",
        "      - \"5432:5432\"",
        "  redis:",
        "    image: redis:7",
        "    healthcheck:",
        "      test: [\"CMD\", \"redis-cli\", \"ping\"]"
      ].join("\n")
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["docker-compose.yml"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createComposeDetector()]
    });

    expect(result.warnings).toEqual([]);
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "compose.file_detected",
          value: {
            path: "docker-compose.yml",
            serviceCount: 3
          }
        }),
        expect.objectContaining({
          kind: "compose.service_detected",
          value: expect.objectContaining({
            name: "api",
            build: ".",
            command: "pnpm dev",
            environment: ["DATABASE_URL", "PUBLIC_URL"],
            depends_on: ["db", "redis"]
          })
        }),
        expect.objectContaining({
          kind: "environment.variable_detected",
          value: {
            name: "DATABASE_URL",
            source: "compose",
            service: "api"
          }
        }),
        expect.objectContaining({
          kind: "database.dependency_detected",
          value: {
            name: "postgresql",
            kind: "database",
            service: "db"
          }
        }),
        expect.objectContaining({
          kind: "cache.dependency_detected",
          value: {
            name: "redis",
            service: "redis"
          }
        }),
        expect.objectContaining({
          kind: "command.detected",
          value: {
            name: "api:command",
            command: "pnpm dev",
            category: "runtime",
            cwd: "."
          }
        })
      ])
    );
    expect(JSON.stringify(result.facts)).not.toContain("postgres://secret");
  });

  it("returns a recoverable warning for invalid Compose YAML", async () => {
    const root = await createFixture({
      "compose.yaml": "services:\n  api: ["
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["compose.yaml"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createComposeDetector()]
    });

    expect(result.facts).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        detector: "compose",
        path: "compose.yaml"
      })
    ]);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-compose-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
