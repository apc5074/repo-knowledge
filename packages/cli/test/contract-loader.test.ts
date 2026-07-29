import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { exitCodes, loadRepositoryContract } from "../src/index.js";

describe("contract loading", () => {
  it("loads a valid repository contract", async () => {
    const contractPath = await createContractFixture(
      "valid-load",
      `
version: 1
repository:
  name: orders-service
  type: service
  primary_language: typescript
`
    );

    await expect(
      loadRepositoryContract({
        ok: true,
        path: contractPath,
        source: "config"
      })
    ).resolves.toMatchObject({
      ok: true,
      path: contractPath,
      contract: {
        repository: {
          name: "orders-service"
        }
      }
    });
  });

  it("maps missing contracts to the contract-not-found exit code", async () => {
    await expect(
      loadRepositoryContract({
        ok: false,
        reason: "contract-not-found",
        attemptedPath: "/tmp/missing/.board/repository.yaml",
        message: "Could not find repository contract",
        nextSteps: ["Run board init to create .board/repository.yaml."]
      })
    ).resolves.toEqual({
      ok: false,
      path: "/tmp/missing/.board/repository.yaml",
      reason: "contract-not-found",
      exitCode: exitCodes.contractNotFound,
      message: "Could not find repository contract",
      issues: [],
      nextSteps: ["Run board init to create .board/repository.yaml."]
    });
  });

  it("maps invalid contracts to the contract-invalid exit code with issues", async () => {
    const contractPath = await createContractFixture(
      "invalid-load",
      `
version: 1
repository:
  name: orders-service
  type: daemon
  primary_language: ruby
`
    );

    const result = await loadRepositoryContract({
      ok: true,
      path: contractPath,
      source: "config"
    });

    expect(result).toMatchObject({
      ok: false,
      path: contractPath,
      reason: "contract-invalid",
      exitCode: exitCodes.contractInvalid
    });
    expect(result.issues.map((issue) => issue.path)).toEqual([
      "repository.type",
      "repository.primary_language"
    ]);
    expect(result.nextSteps).toEqual([
      "Fix the contract issues above, then run board contract validate again."
    ]);
  });

  it("maps unreadable contract paths to access errors", async () => {
    const directory = join(tmpdir(), `board-cli-unreadable-${randomUUID()}`);

    await mkdir(directory, { recursive: true });

    await expect(
      loadRepositoryContract({
        ok: true,
        path: directory,
        source: "config"
      })
    ).resolves.toMatchObject({
      ok: false,
      path: directory,
      reason: "read-error",
      exitCode: exitCodes.permissionOrAccess
    });
  });
});

async function createContractFixture(name: string, yaml: string): Promise<string> {
  const directory = join(tmpdir(), `board-cli-${name}-${randomUUID()}`);
  const contractPath = join(directory, ".board/repository.yaml");

  await mkdir(join(directory, ".board"), { recursive: true });
  await writeFile(contractPath, yaml, "utf8");

  return contractPath;
}
