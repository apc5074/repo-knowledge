import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createMigrationSeedDetector,
  detectDataDirectories,
  scanRepository
} from "../src/index.js";

describe("Migration and seed detector", () => {
  it("detects common migration and seed directories from tracked files", () => {
    expect(
      detectDataDirectories([
        "prisma/migrations/20240101000000_init/migration.sql",
        "db/seeds/users.sql",
        "src/generated/migrations/types.ts"
      ])
    ).toEqual([
      {
        path: "db/seeds",
        kind: "seed",
        tool: undefined,
        evidencePath: "db/seeds/users.sql"
      },
      {
        path: "prisma/migrations",
        kind: "migration",
        tool: "prisma",
        evidencePath: "prisma/migrations/20240101000000_init/migration.sql"
      }
    ]);
  });

  it("emits migration and seed facts for JS and Prisma layouts", async () => {
    const root = await createFixture({
      "prisma/migrations/20240101000000_init/migration.sql": "CREATE TABLE users (id text);",
      "scripts/seed/index.ts": "export async function seed() {}"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["prisma/migrations/20240101000000_init/migration.sql", "scripts/seed/index.ts"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createMigrationSeedDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "migration.directory_detected",
          confidence: "high",
          value: {
            path: "prisma/migrations",
            tool: "prisma"
          }
        }),
        expect.objectContaining({
          kind: "seed.directory_detected",
          value: {
            path: "scripts/seed",
            tool: undefined
          }
        })
      ])
    );
  });

  it("emits migration facts for Python Alembic layouts", async () => {
    const root = await createFixture({
      "alembic/versions/001_create_users.py": "def upgrade(): pass"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["alembic/versions/001_create_users.py"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createMigrationSeedDetector()]
    });

    expect(result.facts).toEqual([
      expect.objectContaining({
        kind: "migration.directory_detected",
        confidence: "high",
        value: {
          path: "alembic",
          tool: "alembic"
        }
      })
    ]);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-migration-seed-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
