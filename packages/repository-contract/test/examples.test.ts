import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseRepositoryContractFile } from "../src/index.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const examplesDirectory = join(packageRoot, "examples");

const requiredExamples = [
  "api-worker.board.repository.yaml",
  "frontend-api.board.repository.yaml",
  "minimal.board.repository.yaml",
  "monorepo.board.repository.yaml",
  "python-api.board.repository.yaml",
  "typescript-api.board.repository.yaml"
] as const;

describe("repository contract examples", () => {
  it("includes every required MVP example contract", async () => {
    const exampleFiles = await readdir(examplesDirectory);

    expect(exampleFiles.sort()).toEqual([...requiredExamples].sort());
  });

  it("parses and validates every example contract", async () => {
    const contracts = await Promise.all(
      requiredExamples.map(async (exampleFile) =>
        parseRepositoryContractFile(join(examplesDirectory, exampleFile))
      )
    );

    expect(contracts).toHaveLength(requiredExamples.length);
    expect(contracts.map((contract) => contract.repository.primary_language)).toEqual(
      expect.arrayContaining(["typescript", "python", "unknown"])
    );
  });

  it("covers core MVP sections across the example set", async () => {
    const contracts = await Promise.all(
      requiredExamples.map(async (exampleFile) =>
        parseRepositoryContractFile(join(examplesDirectory, exampleFile))
      )
    );

    expect(contracts.some((contract) => Object.keys(contract.applications ?? {}).length > 1)).toBe(
      true
    );
    expect(contracts.some((contract) => Object.keys(contract.services ?? {}).length > 0)).toBe(
      true
    );
    expect(contracts.some((contract) => Object.keys(contract.environment ?? {}).length > 0)).toBe(
      true
    );
    expect(contracts.some((contract) => (contract.generated_files ?? []).length > 0)).toBe(true);
    expect(contracts.some((contract) => (contract.related_repositories ?? []).length > 0)).toBe(
      true
    );
    expect(contracts.some((contract) => (contract.known_limitations ?? []).length > 0)).toBe(true);
  });
});
