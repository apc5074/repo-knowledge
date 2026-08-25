import {
  createScannerEvidence,
  createScannerFact,
  type RepositoryScanResult
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import type { GraphBuildContext } from "../src/build-context.js";
import { buildRequestFlow } from "../src/request-flow.js";
import { buildRouteIndex } from "../src/route-index.js";

const routeFact = createScannerFact({
  kind: "api.route_file_detected",
  confidence: "high",
  detector: "python-route-file",
  value: { path: "apps/api/routes/users.py", framework: "FastAPI", route: "/users" },
  evidence: [
    createScannerEvidence({
      kind: "source",
      sourcePath: "apps/api/routes/users.py",
      detector: "python-route-file",
      lineStart: 3,
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
  facts: [routeFact],
  warnings: [],
  errors: [],
  stats: {
    detector_count: 1,
    detectors_succeeded: 1,
    detectors_failed: 0,
    facts_emitted: 1,
    warnings_emitted: 0,
    errors_emitted: 0,
    files_in_inventory: 2
  }
};
const source = new Map([
  [
    "apps/api/routes/users.py",
    "from ..services.users import get_users\n\n@app.get('/users')\nasync def list_users():\n    return get_users()\n"
  ],
  ["apps/api/services/users.py", "def get_users():\n    return []\n"]
]);
const context: GraphBuildContext = {
  repositoryRoot: "/repo",
  repositoryStateRoot: "/repo/.board/state",
  contractPath: ".board/repository.yaml",
  contract: {
    version: 1,
    repository: { name: "Example", type: "service", primary_language: "python" },
    applications: { api: { id: "api", type: "api", working_directory: "apps/api" } }
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

describe("route and request-flow graph relationships", () => {
  it("creates route, handler file/symbol, and runtime-unit relationships from route facts", async () => {
    const result = await buildRouteIndex(input);
    const route = result.nodes.find((node) => node.kind === "route");
    expect(route?.metadata).toMatchObject({ framework: "FastAPI", method: "GET", path: "/users" });
    expect(result.edges.filter((edge) => edge.kind === "handles_route")).toHaveLength(4);
    expect(
      result.evidence.some((evidence) => evidence.summary === "Route handler list_users")
    ).toBe(true);
  });

  it("connects a route to direct calls of locally imported services", async () => {
    const result = await buildRequestFlow(input);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ kind: "calls", confidence: "medium" });
    expect(result.evidence[0]?.sourceLocation?.path).toBe("apps/api/routes/users.py");
  });
});
