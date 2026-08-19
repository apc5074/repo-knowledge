import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const initFixtureRoot = join(dirname(fileURLToPath(import.meta.url)), "fixtures/repos");
const scannerFixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scanner-core/test/fixtures/repos"
);

describe("init fixture repositories", () => {
  it("keeps init-specific fixtures available for main initialization flows", async () => {
    await expectFixture("typescript-api-new/package.json");
    await expectFixture("python-api-new/pyproject.toml");
    await expectFixture("monorepo-new/package.json");
    await expectFixture("api-plus-worker/src/worker.ts");
    await expectFixture("frontend-plus-api/server/index.ts");
    await expectFixture("existing-valid-contract/.board/repository.yaml");
    await expectFixture("existing-invalid-contract/.board/repository.yaml");
    await expectFixture("missing-scripts/package.json");
    await expectFixture("dirty-worktree/.board/repository.yaml");
    await expectFixture("non-git-repository/package.json");
  });

  it("documents scanner fixtures reused by init tests", async () => {
    await expectScannerFixture("typescript-api/package.json");
    await expectScannerFixture("python-api/pyproject.toml");
    await expectScannerFixture("monorepo/package.json");
    await expectScannerFixture("api-plus-worker/package.json");
    await expectScannerFixture("frontend-plus-api/package.json");
  });
});

async function expectFixture(path: string): Promise<void> {
  await expect(access(join(initFixtureRoot, path))).resolves.toBeUndefined();
}

async function expectScannerFixture(path: string): Promise<void> {
  await expect(access(join(scannerFixtureRoot, path))).resolves.toBeUndefined();
}
