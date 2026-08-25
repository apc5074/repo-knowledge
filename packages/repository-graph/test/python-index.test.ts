import { describe, expect, it } from "vitest";

import type { GraphBuildContext } from "../src/build-context.js";
import { indexPythonImports, indexPythonSymbols } from "../src/python-index.js";

const source = new Map([
  [
    "app/main.py",
    [
      "from .utils import helper",
      "import app.models",
      "import external_package",
      "async def handle_request():",
      "    return helper()",
      "class Application:",
      "    pass"
    ].join("\n")
  ],
  ["app/utils.py", "def helper():\n    return 1\n"],
  ["app/models/__init__.py", "class Model:\n    pass\n"],
  ["app/broken.py", "def incomplete()\n"]
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

describe("Python graph indexes", () => {
  it("indexes function and class symbols with source evidence and parser warnings", async () => {
    const result = await indexPythonSymbols(input);
    expect(result.nodes.filter((node) => node.kind === "symbol").map((node) => node.label)).toEqual(
      expect.arrayContaining(["handle_request", "Application", "helper", "Model", "incomplete"])
    );
    expect(result.evidence.every((evidence) => evidence.sourceLocation?.startLine)).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("broken.py"))).toBe(true);
  });

  it("creates local absolute and relative import edges while warning about external imports", async () => {
    const result = await indexPythonImports(input);
    expect(result.edges.filter((edge) => edge.kind === "imports")).toHaveLength(2);
    expect(result.warnings).toContain(
      "Could not resolve Python import 'external_package' from app/main.py."
    );
  });
});
