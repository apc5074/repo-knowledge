import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadRuntimeContract, resolveRuntimeContractPath } from "../src/index.js";

describe("runtime contract loader", () => {
  it("loads and validates the default Board contract path", async () => {
    const repositoryRoot = await tempRepository("valid");
    const contractPath = join(repositoryRoot, ".board/repository.yaml");
    await mkdir(join(repositoryRoot, ".board"), { recursive: true });
    await writeFile(
      contractPath,
      [
        "version: 1",
        "repository:",
        "  name: loader-fixture",
        "  type: service",
        "  primary_language: typescript"
      ].join("\n"),
      "utf8"
    );

    await expect(loadRuntimeContract({ repositoryRoot })).resolves.toMatchObject({
      ok: true,
      path: contractPath,
      contract: {
        repository: {
          name: "loader-fixture"
        }
      }
    });
  });

  it("returns a clear missing-contract result", async () => {
    const repositoryRoot = await tempRepository("missing");

    await expect(loadRuntimeContract({ repositoryRoot })).resolves.toMatchObject({
      ok: false,
      path: join(repositoryRoot, ".board/repository.yaml"),
      reason: "contract-not-found",
      issues: [],
      nextSteps: [expect.stringContaining("board init")]
    });
  });

  it("returns validation issues for invalid contracts", async () => {
    const repositoryRoot = await tempRepository("invalid");
    const contractPath = join(repositoryRoot, "custom.yaml");
    await writeFile(
      contractPath,
      [
        "version: 1",
        "repository:",
        "  name: loader-fixture",
        "  type: service",
        "  primary_language: made-up"
      ].join("\n"),
      "utf8"
    );

    await expect(loadRuntimeContract({ repositoryRoot, contractPath })).resolves.toMatchObject({
      ok: false,
      path: contractPath,
      reason: "contract-invalid",
      issues: [expect.objectContaining({ path: "repository.primary_language" })]
    });
  });

  it("resolves the runtime contract path deterministically", async () => {
    expect(resolveRuntimeContractPath({ repositoryRoot: "/repo" })).toBe(
      "/repo/.board/repository.yaml"
    );
    expect(
      resolveRuntimeContractPath({ repositoryRoot: "/repo", contractPath: "/tmp/board.yaml" })
    ).toBe("/tmp/board.yaml");
  });
});

async function tempRepository(name: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `board-runtime-loader-${name}-`));
}
