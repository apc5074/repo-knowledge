import { describe, expect, it } from "vitest";

import { createRepositoryFixture, parseJsonResult, runCli } from "./harness.js";

describe("board graph commands", () => {
  it("builds a graph and returns graph status, related, and missing explanation envelopes", async () => {
    const repository = await createRepositoryFixture({ name: "graph", contract: "valid" });
    const build = parseJsonResult(
      await runCli(["graph", "build"], { cwd: repository.root, json: true })
    );
    expect(build).toMatchObject({
      ok: true,
      command: "graph build",
      data: { schema_version: 1, kind: "graph_build" }
    });
    const status = parseJsonResult(
      await runCli(["graph", "status"], { cwd: repository.root, json: true })
    );
    expect(status).toMatchObject({
      ok: true,
      command: "graph status",
      data: { schema_version: 1, kind: "graph_status" }
    });
    const related = parseJsonResult(
      await runCli(["graph", "related", ".board/repository.yaml"], {
        cwd: repository.root,
        json: true
      })
    );
    expect(related).toMatchObject({
      ok: true,
      command: "graph related",
      data: { schema_version: 1, kind: "graph_query" }
    });
    const missing = parseJsonResult(
      await runCli(["graph", "explain", "missing"], { cwd: repository.root, json: true })
    );
    expect(missing).toMatchObject({
      ok: false,
      command: "graph explain",
      errors: [{ code: "not_found" }]
    });
  });
});
