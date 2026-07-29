import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  boardCommands,
  cliPackage,
  renderHelp,
  runBoardCli,
  runBoardCliAsync
} from "../src/index.js";

describe("@repo-knowledge/cli", () => {
  it("exports the CLI package identity", () => {
    expect(cliPackage).toEqual({
      name: "@repo-knowledge/cli",
      binary: "board",
      phase: "phase-0-placeholder"
    });
  });

  it("registers all MVP command names", () => {
    expect(boardCommands).toEqual([
      "init",
      "start",
      "status",
      "doctor",
      "explain",
      "task",
      "verify",
      "contract",
      "stop"
    ]);
  });

  it("renders help output with all command names", () => {
    const help = renderHelp();

    for (const command of boardCommands) {
      expect(help).toContain(`  ${command}`);
    }
  });

  it("returns placeholder output for each registered command", () => {
    for (const command of boardCommands) {
      expect(runBoardCli([command])).toEqual({
        exitCode: 0,
        stdout: `board ${command} is a Phase 0 placeholder. Implementation belongs to a later phase.`,
        stderr: ""
      });
    }
  });

  it("rejects unknown commands without running product behavior", () => {
    const result = runBoardCli(["unknown"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown command: unknown");
  });

  it("validates a contract file with human-readable output", async () => {
    const directory = await createContractFixture(
      "valid-human",
      `
version: 1
repository:
  name: orders-service
  type: service
  primary_language: typescript
`
    );

    await expect(
      runBoardCliAsync(["contract", "validate", join(directory, ".board/repository.yaml")])
    ).resolves.toEqual({
      exitCode: 0,
      stdout: `Valid repository contract: ${join(directory, ".board/repository.yaml")}`,
      stderr: ""
    });
  });

  it("uses .board/repository.yaml as the default validation path", async () => {
    const directory = await createContractFixture(
      "valid-default",
      `
version: 1
repository:
  name: orders-service
  type: service
  primary_language: typescript
`
    );
    const previousWorkingDirectory = process.cwd();

    try {
      process.chdir(directory);

      await expect(runBoardCliAsync(["contract", "validate"])).resolves.toEqual({
        exitCode: 0,
        stdout: "Valid repository contract: .board/repository.yaml",
        stderr: ""
      });
    } finally {
      process.chdir(previousWorkingDirectory);
    }
  });

  it("returns path-aware validation errors for invalid contracts", async () => {
    const directory = await createContractFixture(
      "invalid-human",
      `
version: 1
repository:
  name: orders-service
  type: daemon
  primary_language: ruby
`
    );

    const result = await runBoardCliAsync([
      "contract",
      "validate",
      join(directory, ".board/repository.yaml")
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("repository.type:");
    expect(result.stderr).toContain("repository.primary_language:");
  });

  it("supports JSON validation output", async () => {
    const directory = await createContractFixture(
      "valid-json",
      `
version: 1
repository:
  name: orders-service
  type: service
  primary_language: typescript
`
    );

    const result = await runBoardCliAsync([
      "contract",
      "validate",
      join(directory, ".board/repository.yaml"),
      "--json"
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      path: join(directory, ".board/repository.yaml"),
      repository: "orders-service"
    });
  });
});

async function createContractFixture(name: string, yaml: string): Promise<string> {
  const directory = join(tmpdir(), `board-cli-${name}-${randomUUID()}`);

  await mkdir(join(directory, ".board"), { recursive: true });
  await writeFile(join(directory, ".board/repository.yaml"), yaml, "utf8");

  return directory;
}
