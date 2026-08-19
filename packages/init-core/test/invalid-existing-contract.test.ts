import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { initializeRepository } from "../src/index.js";

describe("invalid existing contract init flow", () => {
  it("skips overwriting invalid contracts and proposes a generated sidecar draft", async () => {
    const root = await createInvalidContractRepository("dry-run");
    const result = await initializeRepository({
      root,
      includeUntracked: true
    });

    expect(result.validation.ok).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Existing contract"),
        expect.stringContaining("could not be parsed or validated")
      ])
    );
    expect(result.reviewItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "existing-contract-invalid",
          kind: "conflict",
          summary: expect.stringContaining("repository.type:")
        })
      ])
    );
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".board/repository.yaml",
          action: "skip",
          content: undefined
        }),
        expect.objectContaining({
          path: ".board/repository.generated.yaml",
          action: "create",
          content: expect.stringContaining("repository:")
        })
      ])
    );
    expect(result.filesToUpdate).toEqual([]);
    expect(result.nextSteps).toEqual(
      expect.arrayContaining([
        "Repair .board/repository.yaml before treating the repository contract as valid."
      ])
    );
  });

  it("write mode leaves the invalid source contract untouched", async () => {
    const root = await createInvalidContractRepository("write");
    const contractPath = join(root, ".board/repository.yaml");
    const original = await readFile(contractPath, "utf8");
    const result = await initializeRepository({
      root,
      mode: "write",
      includeUntracked: true
    });

    expect(await readFile(contractPath, "utf8")).toBe(original);
    await expect(
      readFile(join(root, ".board/repository.generated.yaml"), "utf8")
    ).resolves.toContain("repository:");
    expect(result.filesWritten).toEqual(
      expect.arrayContaining([".board", ".board/repository.generated.yaml"])
    );
    expect(result.filesWritten).not.toContain(".board/repository.yaml");
  });
});

async function createInvalidContractRepository(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `board-init-invalid-${name}-`));

  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: `invalid-${name}`,
      scripts: {
        test: "vitest run"
      }
    }),
    "utf8"
  );
  await mkdir(join(root, ".board"), { recursive: true });
  await writeFile(
    join(root, ".board/repository.yaml"),
    [
      "version: 1",
      "repository:",
      `  name: invalid-${name}`,
      "  type: daemon",
      "  primary_language: ruby",
      ""
    ].join("\n"),
    "utf8"
  );

  return root;
}
