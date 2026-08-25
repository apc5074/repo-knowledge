import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const scannerFixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "scanner-core",
  "test",
  "fixtures",
  "repos"
);
const graphFixtureRepositories = [
  "typescript-api",
  "python-api",
  "monorepo",
  "frontend-plus-api",
  "api-plus-worker",
  "generated-repo",
  "legacy-repo",
  "ci-repo"
] as const;

describe("repository graph fixture repositories", () => {
  it("reuses deterministic scanner fixtures for graph language, runtime, generated, legacy, and reference coverage", async () => {
    await Promise.all(graphFixtureRepositories.map((name) => access(join(scannerFixtures, name))));
    expect(graphFixtureRepositories).toEqual(
      expect.arrayContaining([
        "typescript-api",
        "python-api",
        "monorepo",
        "api-plus-worker",
        "legacy-repo"
      ])
    );
  });
});
