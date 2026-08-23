import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadVerificationContract } from "../src/index.js";

describe("@repo-knowledge/verification-runtime contract loader", () => {
  it("loads a valid repository contract and exposes verification config", async () => {
    const repositoryRoot = await createTempRoot();
    const contractPath = join(repositoryRoot, ".board/repository.yaml");
    await ensureContract(contractPath);

    const result = await loadVerificationContract({ repositoryRoot });

    expect(result).toMatchObject({
      ok: true,
      path: contractPath,
      version: 1,
      verification: {
        default: expect.any(Array),
        rules: expect.any(Array)
      }
    });
  });

  it("reports missing contracts clearly", async () => {
    const repositoryRoot = await createTempRoot();
    const result = await loadVerificationContract({ repositoryRoot });

    expect(result).toMatchObject({
      ok: false,
      reason: "contract-not-found"
    });
  });
});

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "board-verification-contract-"));
}

async function ensureContract(contractPath: string): Promise<void> {
  await mkdir(join(contractPath, ".."), { recursive: true });
  await writeFile(
    contractPath,
    `version: 1
repository:
  name: example
  type: application
  primary_language: typescript
related_repositories: []
external_systems: []
known_limitations: []
verification:
  default:
    - id: lint
      command:
        command: pnpm
        args: [lint]
  rules:
    - id: src
      paths: ["src/**"]
      checks:
        - id: test
          command:
            command: pnpm
            args: [test]
`,
    "utf8"
  );
}
