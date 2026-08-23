import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runVerificationOrchestrator, runVerificationTool } from "../src/index.js";

describe("@repo-knowledge/verification-runtime orchestrator execution", () => {
  it("runs checks, records history, and returns a serializable run", async () => {
    const repositoryRoot = await createFixtureRepository();
    const result = await runVerificationOrchestrator({
      repositoryRoot,
      repositoryStateRoot: join(repositoryRoot, ".board-state"),
      all: true,
      env: {
        API_TOKEN: "secret-token"
      },
      dryRun: false
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.run.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "lint", status: "passed" }),
        expect.objectContaining({ id: "secret-check", status: "passed" }),
        expect.objectContaining({ id: "api-check", status: "passed" }),
        expect.objectContaining({ id: "timeout-check", status: "timed_out" })
      ])
    );
    expect(result.run.plan.selectedChecks.map((check) => check.id)).toEqual([
      "lint",
      "secret-check",
      "api-check",
      "timeout-check"
    ]);
    expect(result.run.status).toBe("failed");
    expect(result.run.runId).toContain("verify_");

    const persistedRun = await readFile(
      join(repositoryRoot, ".board-state/verification/runs", `${result.run.runId}.json`),
      "utf8"
    );
    expect(persistedRun).toContain("[redacted]");
    expect(persistedRun).not.toContain("secret-token");
  });

  it("reports blocked checks when required env vars are missing", async () => {
    const repositoryRoot = await createFixtureRepository();
    const result = await runVerificationOrchestrator({
      repositoryRoot,
      repositoryStateRoot: join(repositoryRoot, ".board-state"),
      changedPaths: [],
      env: {},
      requestedCheckIds: ["secret-check"],
      dryRun: false
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.run.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "secret-check", status: "blocked" })])
    );
  });

  it("records checks skipped by user selection", async () => {
    const repositoryRoot = await createFixtureRepository();
    const result = await runVerificationOrchestrator({
      repositoryRoot,
      all: true,
      skippedCheckIds: ["api-check"],
      env: {
        API_TOKEN: "secret-token"
      },
      dryRun: false
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.run.plan.skippedChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "api-check", skipReason: "skipped-by-user" })
      ])
    );
    expect(result.run.results.map((check) => check.id)).not.toContain("api-check");
  });

  it("exposes an agent-compatible tool result", async () => {
    const repositoryRoot = await createFixtureRepository();
    const result = await runVerificationTool({
      repositoryRoot,
      repositoryStateRoot: join(repositoryRoot, ".board-state"),
      changedPaths: ["src/api/example.ts"],
      dryRun: true
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.json).toMatchObject({
      run_id: expect.stringMatching(/^verify_/)
    });
  });
});

async function createFixtureRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "board-verification-orchestrator-"));
  await mkdir(join(root, ".board"), { recursive: true });
  await writeFile(
    join(root, ".board/repository.yaml"),
    `version: 1
repository:
  name: fixture
  type: service
  primary_language: typescript
verification:
  default:
    - id: lint
      command:
        command: node
        args:
          - -e
          - "console.log('lint')"
    - id: secret-check
      command:
        command: node
        args:
          - -e
          - "console.log(process.env.API_TOKEN)"
        environment:
          - API_TOKEN
  rules:
    - id: api
      paths:
        - src/api/**
      checks:
        - id: api-check
          command:
            command: node
            args:
              - -e
              - "console.log('api')"
        - id: timeout-check
          command:
            command: node
            args:
              - -e
              - "setTimeout(() => {}, 2000)"
            timeout_seconds: 1
`,
    "utf8"
  );
  await mkdir(join(root, "src/api"), { recursive: true });
  await writeFile(join(root, "src/api/example.ts"), "export const example = true;\n", "utf8");
  return root;
}
