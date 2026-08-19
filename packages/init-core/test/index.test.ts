import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  initCorePackage,
  initializeRepository,
  normalizeInitializeRepositoryOptions
} from "../src/index.js";

describe("@repo-knowledge/init-core", () => {
  it("exports package identity", () => {
    expect(initCorePackage).toMatchObject({
      name: "@repo-knowledge/init-core",
      owns: "contract-initialization-workflow"
    });
  });

  it("normalizes initialization options", () => {
    expect(
      normalizeInitializeRepositoryOptions({
        root: "/repo"
      })
    ).toMatchObject({
      root: "/repo",
      mode: "dry-run",
      force: false,
      skipScripts: false,
      includeUntracked: false
    });
  });

  it("runs scanner-backed initialization without CLI printing", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-init-core-"));

    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "orders-service",
        scripts: {
          test: "vitest run"
        },
        dependencies: {
          express: "^5.0.0"
        }
      }),
      "utf8"
    );

    const result = await initializeRepository({
      root,
      includeUntracked: true,
      agent: {
        agentRunId: "agent-run-test",
        toolCallId: "tool-call-test"
      }
    });

    expect(result).toMatchObject({
      ok: true,
      mode: "dry-run",
      approvalRequired: true,
      approvalStatus: "approval-required",
      agentRunId: "agent-run-test",
      toolCallId: "tool-call-test",
      proposedContract: {
        repository: {
          name: "orders-service",
          type: "service",
          primary_language: "javascript"
        }
      },
      filesWritten: []
    });
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".board/repository.yaml",
          action: "create"
        })
      ])
    );
    expect(result.proposalId).toMatch(/^proposal-local-/);
    expect(result.scan.facts.length).toBeGreaterThan(0);
    expect(result.workflowSteps[0]).toMatchObject({
      id: "scan-repository",
      status: "completed"
    });
  });
});
