import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFileInventory,
  createComposeDetector,
  createDatabaseDependencyDetector,
  createDockerfileDetector,
  createJavaScriptFrameworkDetector,
  createJavaScriptManifestDetector,
  createMigrationSeedDetector,
  createPythonFrameworkDetector,
  createPythonManifestDetector,
  createPythonRouteDetector,
  createPythonSourceDetector,
  createWorkerDetector,
  scanRepository
} from "../src/index.js";

const fixtureRoot = join(import.meta.dirname, "fixtures", "repos");

describe("Scanner fixture repositories", () => {
  it("provides all required realistic fixture repositories", async () => {
    const fixtureNames = [
      "typescript-api",
      "python-api",
      "monorepo",
      "api-plus-worker",
      "frontend-plus-api",
      "compose-repo",
      "devcontainer-repo",
      "ci-repo",
      "generated-repo",
      "repo-skill-repo",
      "legacy-repo",
      "invalid-config-repo"
    ];

    for (const fixtureName of fixtureNames) {
      const inventory = await buildFileInventory({
        root: join(fixtureRoot, fixtureName),
        includeUntracked: true
      });

      expect(inventory.files.length).toBeGreaterThan(0);
    }
  });

  it("scans the TypeScript API fixture for API, database, Redis, and migrations", async () => {
    const root = join(fixtureRoot, "typescript-api");
    const inventory = await buildFileInventory({
      root,
      includeUntracked: true
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [
        createJavaScriptManifestDetector(),
        createJavaScriptFrameworkDetector(),
        createDatabaseDependencyDetector(),
        createMigrationSeedDetector()
      ]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "framework.detected",
          value: expect.objectContaining({
            name: "express"
          })
        }),
        expect.objectContaining({
          kind: "database.dependency_detected",
          value: expect.objectContaining({
            name: "postgresql"
          })
        }),
        expect.objectContaining({
          kind: "cache.dependency_detected",
          value: expect.objectContaining({
            name: "redis"
          })
        }),
        expect.objectContaining({
          kind: "migration.directory_detected",
          value: {
            path: "prisma/migrations",
            tool: "prisma"
          }
        })
      ])
    );
  });

  it("scans the Python API fixture for FastAPI, PostgreSQL, routes, and Alembic", async () => {
    const root = join(fixtureRoot, "python-api");
    const inventory = await buildFileInventory({
      root,
      includeUntracked: true
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [
        createPythonManifestDetector(),
        createPythonSourceDetector(),
        createPythonFrameworkDetector(),
        createPythonRouteDetector(),
        createDatabaseDependencyDetector(),
        createMigrationSeedDetector()
      ]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "framework.detected",
          value: expect.objectContaining({
            name: "FastAPI"
          })
        }),
        expect.objectContaining({
          kind: "database.dependency_detected",
          value: expect.objectContaining({
            name: "postgresql"
          })
        }),
        expect.objectContaining({
          kind: "api.route_file_detected",
          value: expect.objectContaining({
            path: "app/main.py"
          })
        }),
        expect.objectContaining({
          kind: "migration.directory_detected",
          value: {
            path: "alembic",
            tool: "alembic"
          }
        })
      ])
    );
  });

  it("scans the Compose fixture for Docker, Compose, and service dependencies", async () => {
    const root = join(fixtureRoot, "compose-repo");
    const inventory = await buildFileInventory({
      root,
      includeUntracked: true
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [
        createDockerfileDetector(),
        createComposeDetector(),
        createDatabaseDependencyDetector()
      ]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "dockerfile.detected"
        }),
        expect.objectContaining({
          kind: "compose.file_detected"
        }),
        expect.objectContaining({
          kind: "service.detected",
          value: expect.objectContaining({
            name: "db"
          })
        })
      ])
    );
  });

  it("scans the API plus worker fixture for worker signals", async () => {
    const root = join(fixtureRoot, "api-plus-worker");
    const inventory = await buildFileInventory({
      root,
      includeUntracked: true
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createJavaScriptManifestDetector(), createWorkerDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "worker.detected",
          value: expect.objectContaining({
            command: "tsx src/worker.ts"
          })
        })
      ])
    );
  });
});
