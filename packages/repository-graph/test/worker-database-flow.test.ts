import {
  createScannerEvidence,
  createScannerFact,
  type RepositoryScanResult
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import type { GraphBuildContext } from "../src/build-context.js";
import { buildDatabaseAccess } from "../src/database-access.js";
import { buildWorkerFlow } from "../src/worker-flow.js";

const worker = createScannerFact({
  kind: "worker.detected",
  confidence: "high",
  detector: "worker",
  value: { path: "src/worker.ts", queue: "emails", command: "pnpm worker", framework: "bullmq" },
  evidence: [
    createScannerEvidence({
      kind: "source",
      sourcePath: "src/worker.ts",
      detector: "worker",
      lineStart: 1
    })
  ]
});
const database = createScannerFact({
  kind: "database.dependency_detected",
  confidence: "high",
  detector: "database",
  value: { name: "postgresql", kind: "database" },
  evidence: [
    createScannerEvidence({
      kind: "config",
      sourcePath: "package.json",
      detector: "database",
      lineStart: 4
    })
  ]
});
const migration = createScannerFact({
  kind: "migration.directory_detected",
  confidence: "high",
  detector: "migration",
  value: { path: "prisma/migrations", tool: "prisma" },
  evidence: [
    createScannerEvidence({
      kind: "source",
      sourcePath: "prisma/migrations/001_init.sql",
      detector: "migration",
      lineStart: 1
    })
  ]
});
const seed = createScannerFact({
  kind: "seed.directory_detected",
  confidence: "high",
  detector: "migration",
  value: { path: "prisma/seeds", tool: "prisma" },
  evidence: [
    createScannerEvidence({
      kind: "source",
      sourcePath: "prisma/seeds/users.ts",
      detector: "migration",
      lineStart: 1
    })
  ]
});
const route = createScannerFact({
  kind: "api.route_file_detected",
  confidence: "high",
  detector: "route",
  value: { path: "src/routes/users.ts", route: "/users" },
  evidence: [
    createScannerEvidence({
      kind: "source",
      sourcePath: "src/routes/users.ts",
      detector: "route",
      lineStart: 1,
      excerpt: '@app.get("/users")'
    })
  ]
});
const scan: RepositoryScanResult = {
  schema_version: 1,
  tool_name: "scan_repository",
  repository_root: "/repo",
  scanned_at: "2026-01-01T00:00:00.000Z",
  duration_ms: 1,
  facts: [worker, database, migration, seed, route],
  warnings: [],
  errors: [],
  stats: {
    detector_count: 5,
    detectors_succeeded: 5,
    detectors_failed: 0,
    facts_emitted: 5,
    warnings_emitted: 0,
    errors_emitted: 0,
    files_in_inventory: 3
  }
};
const source = new Map([
  ["src/worker.ts", "await db.email.create({ data: {} });"],
  [
    "src/routes/users.ts",
    "const users = await prisma.user.findMany();\nawait prisma.user.create({ data: {} });"
  ],
  ["prisma/migrations/001_init.sql", "CREATE TABLE users ();"],
  ["prisma/seeds/users.ts", ""]
]);
const context: GraphBuildContext = {
  repositoryRoot: "/repo",
  repositoryStateRoot: "/repo/.board/state",
  contractPath: ".board/repository.yaml",
  contract: {
    version: 1,
    repository: { name: "Example", type: "service", primary_language: "typescript" },
    setup: { migrate: { command: "pnpm prisma migrate" }, seed: { command: "pnpm seed" } }
  },
  scannerResult: scan,
  verificationHistory: { schemaVersion: 1, runs: [] },
  knownProblems: [],
  legacyCandidates: [],
  inventory: { files: [...source.keys()] },
  sourceFingerprints: {},
  warnings: []
};

describe("worker and database graph flows", () => {
  it("connects worker entrypoints to their queue and command", () => {
    const result = buildWorkerFlow({ context, buildId: "build-1" });
    expect(result.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining(["worker", "queue", "command", "file"])
    );
    expect(result.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining(["owns", "depends_on", "runs"])
    );
  });

  it("models database, migration, seed, and direct read/write access with evidence", async () => {
    const result = await buildDatabaseAccess({
      context,
      buildId: "build-1",
      readSource: async (path) => source.get(path) ?? Promise.reject(new Error("missing source"))
    });
    expect(result.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining(["database", "migration", "table", "command"])
    );
    expect(result.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining(["reads", "writes", "runs"])
    );
    expect(result.evidence.some((evidence) => evidence.summary === "reads user")).toBe(true);
  });
});
