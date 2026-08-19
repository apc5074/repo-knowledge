import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { attachArtifactDiffs, buildArtifactDiff, initializeRepository } from "../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("init artifact diffs", () => {
  it("generates deterministic create diffs", () => {
    const diff = buildArtifactDiff({
      path: ".board/repository.yaml",
      action: "create",
      after: "version: 1\nrepository:\n  name: demo\n"
    });

    expect(diff.text).toBe(
      [
        "--- /dev/null",
        "+++ b/.board/repository.yaml",
        "@@ -1,0 +1,3 @@",
        "+version: 1",
        "+repository:",
        "+  name: demo",
        ""
      ].join("\n")
    );
  });

  it("generates deterministic update diffs", () => {
    const diff = buildArtifactDiff({
      path: ".board/repository.yaml",
      action: "update",
      before: "version: 1\nrepository:\n  name: old\n",
      after: "version: 1\nrepository:\n  name: new\n"
    });

    expect(diff.text).toContain("--- a/.board/repository.yaml\n+++ b/.board/repository.yaml");
    expect(diff.text).toContain("-  name: old\n+  name: new");
  });

  it("attaches diffs only to create and update artifacts with content", () => {
    const artifacts = attachArtifactDiffs({
      artifacts: [
        {
          path: ".board/repository.yaml",
          action: "update",
          content: "version: 1\nrepository:\n  name: new\n"
        },
        {
          path: "AGENTS.md",
          action: "deferred"
        }
      ],
      existingContentByPath: {
        ".board/repository.yaml": "version: 1\nrepository:\n  name: old\n"
      }
    });

    expect(artifacts[0]?.diff).toContain("-  name: old\n+  name: new");
    expect(artifacts[1]?.diff).toBeUndefined();
  });

  it("initializeRepository includes contract artifact diffs", async () => {
    const result = await initializeRepository({
      root: join(fixtureRoot, "typescript-api"),
      includeUntracked: true
    });
    const artifact = result.artifacts.find(
      (candidate) => candidate.path === ".board/repository.yaml"
    );

    expect(artifact?.diff).toContain("+++ b/.board/repository.yaml");
    expect(artifact?.diff).toContain("+version: 1");
  });
});
