import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseRepositoryContract,
  parseRepositoryContractFile,
  serializeRepositoryContract
} from "../src/index.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const examplesDirectory = join(packageRoot, "examples");

describe("repository contract round-trip behavior", () => {
  it("round-trips every valid example without changing normalized data", async () => {
    const exampleFiles = await listExampleFiles();

    for (const exampleFile of exampleFiles) {
      const parsed = await parseRepositoryContractFile(join(examplesDirectory, exampleFile));
      const serialized = serializeRepositoryContract(parsed);
      const reparsed = parseRepositoryContract(serialized);

      expect(reparsed, exampleFile).toEqual(parsed);
    }
  });

  it("serializes every valid example deterministically", async () => {
    const exampleFiles = await listExampleFiles();

    for (const exampleFile of exampleFiles) {
      const parsed = await parseRepositoryContractFile(join(examplesDirectory, exampleFile));
      const first = serializeRepositoryContract(parsed);
      const second = serializeRepositoryContract(parsed);

      expect(second, exampleFile).toBe(first);
    }
  });

  it("does not introduce default-noise fields into serialized examples", async () => {
    const exampleFiles = await listExampleFiles();

    for (const exampleFile of exampleFiles) {
      const parsed = await parseRepositoryContractFile(join(examplesDirectory, exampleFile));
      const serialized = serializeRepositoryContract(parsed);

      expect(serialized, exampleFile).not.toContain("optional: false");
      expect(serialized, exampleFile).not.toContain("secret: false");
      expect(serialized, exampleFile).not.toContain("ports: []");
      expect(serialized, exampleFile).not.toContain("evidence: []");
      expect(serialized, exampleFile).not.toContain("applications: {}");
      expect(serialized, exampleFile).not.toContain("services: {}");
    }
  });
});

async function listExampleFiles(): Promise<string[]> {
  const fileNames = await readdir(examplesDirectory);

  return fileNames.filter((fileName) => fileName.endsWith(".yaml")).sort();
}
