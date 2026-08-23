import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runVerificationTool } from "../src/index.js";

describe("@repo-knowledge/verification-runtime agent tool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a serializable dry-run record without terminal output", async () => {
    const repositoryRoot = await createAgentToolFixture();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await runVerificationTool({
      repositoryRoot,
      dryRun: true,
      requestedPaths: ["src/api/routes.ts"],
      noDefault: true
    });

    expect(result).toMatchObject({
      ok: true,
      dryRun: true,
      exitCode: 0,
      runId: expect.stringMatching(/^verify_/),
      plan: {
        selectedChecks: [expect.objectContaining({ id: "api-check" })]
      },
      json: {
        schema_version: 1,
        status: "skipped",
        plan: {
          selectedChecks: [expect.objectContaining({ id: "api-check" })]
        }
      }
    });
    expect(() => JSON.stringify(result.json)).not.toThrow();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("returns structured errors for missing contracts", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "board-agent-tool-missing-"));

    const result = await runVerificationTool({
      repositoryRoot,
      dryRun: true
    });

    expect(result).toMatchObject({
      ok: false,
      dryRun: true,
      exitCode: 2,
      error: expect.stringContaining(".board/repository.yaml")
    });
  });
});

async function createAgentToolFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "board-agent-tool-"));
  await mkdir(join(root, ".board"), { recursive: true });
  await writeFile(
    join(root, ".board/repository.yaml"),
    `version: 1
repository:
  name: agent-tool-fixture
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
`,
    "utf8"
  );
  return root;
}
