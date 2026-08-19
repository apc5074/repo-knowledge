import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createDatabaseDependencyDetector,
  scanRepository
} from "../src/index.js";

describe("Database dependency detector", () => {
  it("detects PostgreSQL and Redis from JavaScript manifests and env examples", async () => {
    const root = await createFixture({
      "package.json": JSON.stringify({
        dependencies: {
          pg: "^8.0.0",
          ioredis: "^5.0.0"
        }
      }),
      ".env.example": "DATABASE_URL=postgres://example\nREDIS_URL=redis://example\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["package.json", ".env.example"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createDatabaseDependencyDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "database.dependency_detected",
          confidence: "high",
          value: expect.objectContaining({
            name: "postgresql",
            package: "pg",
            sources: ["manifest"]
          })
        }),
        expect.objectContaining({
          kind: "database.dependency_detected",
          confidence: "high",
          value: expect.objectContaining({
            name: "postgresql",
            sources: ["env"]
          })
        }),
        expect.objectContaining({
          kind: "cache.dependency_detected",
          confidence: "high",
          value: expect.objectContaining({
            name: "redis",
            package: "ioredis"
          })
        })
      ])
    );
    expect(JSON.stringify(result.facts)).not.toContain("postgres://example");
    expect(JSON.stringify(result.facts)).not.toContain("redis://example");
  });

  it("detects database packages from Python manifests", async () => {
    const root = await createFixture({
      "requirements.txt": "fastapi\npsycopg[binary]\nredis==5.0.0\nsqlalchemy>=2\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["requirements.txt"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createDatabaseDependencyDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "database.dependency_detected",
          value: expect.objectContaining({
            name: "postgresql",
            package: "psycopg"
          })
        }),
        expect.objectContaining({
          kind: "database.dependency_detected",
          value: expect.objectContaining({
            name: "database",
            package: "sqlalchemy"
          })
        }),
        expect.objectContaining({
          kind: "cache.dependency_detected",
          value: expect.objectContaining({
            name: "redis",
            package: "redis"
          })
        })
      ])
    );
  });

  it("detects Compose services and keeps port-only service signals low confidence", async () => {
    const root = await createFixture({
      "compose.yml": [
        "services:",
        "  db:",
        "    image: postgres:16",
        "    ports:",
        '      - "5432:5432"',
        "  cache:",
        "    ports:",
        '      - "6379:6379"'
      ].join("\n")
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["compose.yml"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createDatabaseDependencyDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "database.dependency_detected",
          confidence: "high",
          value: expect.objectContaining({
            name: "postgresql",
            service: "db",
            sources: ["compose-image", "compose-port"]
          })
        }),
        expect.objectContaining({
          kind: "cache.dependency_detected",
          confidence: "low",
          value: expect.objectContaining({
            name: "redis",
            service: "cache",
            port: 6379,
            sources: ["compose-port"]
          })
        }),
        expect.objectContaining({
          kind: "service.detected",
          value: expect.objectContaining({
            name: "db",
            kind: "database",
            source: "compose"
          })
        })
      ])
    );
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-database-dependency-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
