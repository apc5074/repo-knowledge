import {
  createScannerEvidence,
  createScannerFact,
  type RepositoryScanResult
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import type { GraphBuildContext } from "../src/build-context.js";
import { buildGeneratedPathGraph } from "../src/generated-paths.js";
import { buildTestRelations } from "../src/test-relations.js";

const generated = createScannerFact({
  kind: "generated.path_detected",
  confidence: "high",
  detector: "generated",
  value: {
    path: "src/generated",
    generator: "openapi",
    regenerationCommand: "pnpm generate",
    reason: "generated directory"
  },
  evidence: [
    createScannerEvidence({
      kind: "source",
      sourcePath: "src/generated/client.ts",
      detector: "generated",
      lineStart: 1
    })
  ]
});
const scan: RepositoryScanResult = {
  schema_version: 1,
  tool_name: "scan_repository",
  repository_root: "/repo",
  scanned_at: "2026-01-01T00:00:00.000Z",
  duration_ms: 1,
  facts: [generated],
  warnings: [],
  errors: [],
  stats: {
    detector_count: 1,
    detectors_succeeded: 1,
    detectors_failed: 0,
    facts_emitted: 1,
    warnings_emitted: 0,
    errors_emitted: 0,
    files_in_inventory: 5
  }
};
const source = new Map([
  ["src/users.ts", "export const users = [];"],
  [
    "src/users.test.ts",
    "import { users } from './users';\ntest('users', () => expect(users).toEqual([]));"
  ],
  ["app/worker.py", "def work():\n    return 1\n"],
  ["tests/test_worker.py", "from app.worker import work\n"],
  ["src/generated/client.ts", "export const generated = true;"]
]);
const context: GraphBuildContext = {
  repositoryRoot: "/repo",
  repositoryStateRoot: "/repo/.board/state",
  contractPath: ".board/repository.yaml",
  contract: {
    version: 1,
    repository: { name: "Example", type: "service", primary_language: "typescript" },
    generated_files: [
      {
        pattern: "src/generated/**",
        generated_by: { command: "pnpm generate" },
        source_paths: ["openapi/schema.yaml"]
      }
    ],
    unsafe_paths: [
      { pattern: "src/generated/**", reason: "generated", edit_instead: "openapi/schema.yaml" }
    ]
  },
  scannerResult: scan,
  verificationHistory: { schemaVersion: 1, runs: [] },
  knownProblems: [],
  legacyCandidates: [],
  inventory: { files: [...source.keys()] },
  sourceFingerprints: {},
  warnings: []
};
const input = {
  context,
  buildId: "build-1",
  readSource: async (path: string) =>
    source.get(path) ?? Promise.reject(new Error("missing source"))
};

describe("test and generated-path graph relationships", () => {
  it("connects conventional and import-based TypeScript and Python tests to source files", async () => {
    const result = await buildTestRelations(input);
    expect(result.nodes.filter((node) => node.kind === "test")).toHaveLength(2);
    expect(result.edges.map((edge) => edge.confidence)).toEqual(
      expect.arrayContaining(["low", "high"])
    );
    expect(result.edges.every((edge) => edge.kind === "tests")).toBe(true);
  });

  it("models only scanner- or contract-backed generated paths as unsafe and regenerable", () => {
    const result = buildGeneratedPathGraph({ context, buildId: "build-1" });
    expect(result.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining(["generated_artifact", "command", "file"])
    );
    expect(result.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining(["unsafe_to_edit", "generates"])
    );
    expect(
      result.nodes.some(
        (node) => node.path === "src/users.ts" && node.kind === "generated_artifact"
      )
    ).toBe(false);
  });
});
