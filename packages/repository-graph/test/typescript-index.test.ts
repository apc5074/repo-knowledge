import { describe, expect, it } from "vitest";

import type { GraphBuildContext } from "../src/build-context.js";
import { indexTypeScriptImports, indexTypeScriptSymbols } from "../src/typescript-index.js";

const source = new Map([
  ["package.json", JSON.stringify({ name: "workspace-root" })],
  ["packages/shared/package.json", JSON.stringify({ name: "@example/shared" })],
  [
    "src/index.ts",
    `export { helper } from "./helper";
export default function main() { return import("./lazy"); }
import { helper } from "./helper";
import { item } from "@example/shared";
import "missing-package";
export const value = helper + item;`
  ],
  [
    "src/helper.ts",
    "export function helper() { return 1; }\nexport interface Item { id: string; }"
  ],
  ["src/lazy.ts", "export class Lazy {}"],
  ["src/view.tsx", "export const View = () => <div />;"],
  ["src/broken.ts", "export function {"]
]);
const context: GraphBuildContext = {
  repositoryRoot: "/repo",
  repositoryStateRoot: "/repo/.board/state",
  scannerResult: {
    schema_version: 1,
    tool_name: "scan_repository",
    repository_root: "/repo",
    scanned_at: "2026-01-01T00:00:00.000Z",
    duration_ms: 1,
    facts: [],
    warnings: [],
    errors: [],
    stats: {
      detector_count: 0,
      detectors_succeeded: 0,
      detectors_failed: 0,
      facts_emitted: 0,
      warnings_emitted: 0,
      errors_emitted: 0,
      files_in_inventory: source.size
    }
  },
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

describe("TypeScript and JavaScript graph indexes", () => {
  it("indexes named, default, type, class, and TSX exports with source evidence", async () => {
    const result = await indexTypeScriptSymbols(input);
    expect(result.nodes.filter((node) => node.kind === "symbol").map((node) => node.label)).toEqual(
      expect.arrayContaining(["main", "value", "helper", "Item", "Lazy", "View"])
    );
    expect(result.edges.every((edge) => edge.kind === "exports")).toBe(true);
    expect(result.evidence.every((evidence) => evidence.sourceLocation?.startLine)).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("broken.ts"))).toBe(true);
  });

  it("creates local, dynamic, and workspace import relationships and warns for unresolved imports", async () => {
    const result = await indexTypeScriptImports(input);
    expect(result.edges.filter((edge) => edge.kind === "imports")).toHaveLength(2);
    expect(result.edges.some((edge) => edge.kind === "depends_on")).toBe(true);
    expect(result.warnings).toContain(
      "Could not resolve import 'missing-package' from src/index.ts."
    );
  });
});
