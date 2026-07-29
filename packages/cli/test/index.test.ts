import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  boardCommands,
  cliPackage,
  createBoardProgram,
  getVersionInfo,
  renderHelp,
  runBoardCli,
  runBoardCliAsync
} from "../src/index.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

describe("@repo-knowledge/cli", () => {
  it("exports the CLI package identity", () => {
    expect(cliPackage).toEqual({
      name: "@repo-knowledge/cli",
      binary: "board",
      version: "0.0.0",
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
      expect(help).toContain(command);
    }

    expect(help).toContain("--json");
    expect(help).toContain("--cwd <path>");
    expect(help).toContain("--config <path>");
  });

  it("creates a testable Commander app with command-specific help", () => {
    const program = createBoardProgram();

    expect(program.name()).toBe("board");
    expect(runBoardCli(["init", "--help"])).toMatchObject({
      exitCode: 0,
      stderr: ""
    });
    expect(runBoardCli(["init", "--help"]).stdout).toContain("init command placeholder");
  });

  it("returns version output without repository context", () => {
    expect(runBoardCli(["--version"])).toEqual({
      exitCode: 0,
      stdout: "0.0.0",
      stderr: ""
    });
  });

  it("returns structured JSON version output through the common result shape", () => {
    const result = runBoardCli(["--json", "--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      status: "success",
      command: "version",
      summary: "0.0.0",
      data: {
        version: "0.0.0"
      },
      warnings: [],
      errors: [],
      next_steps: [],
      review_items: [],
      candidate_findings: []
    });
  });

  it("can include verbose local version diagnostics", () => {
    expect(getVersionInfo(true)).toMatchObject({
      version: "0.0.0",
      node: process.version,
      platform: process.platform,
      arch: process.arch
    });
  });

  it("returns placeholder output for each registered command", () => {
    for (const command of boardCommands) {
      expect(runBoardCli([command])).toEqual({
        exitCode: 0,
        stdout: `board ${command} is a Phase 2 placeholder. Implementation belongs to a later phase.`,
        stderr: ""
      });
    }
  });

  it("keeps the executable package metadata and shebang in place", async () => {
    const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
      readonly bin: {
        readonly board: string;
      };
    };
    const entrypoint = await readFile(join(packageRoot, "src/index.ts"), "utf8");

    expect(packageJson.bin.board).toBe("./dist/index.js");
    expect(entrypoint.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("rejects unknown commands without running product behavior", () => {
    const result = runBoardCli(["unknown"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unknown command 'unknown'");
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

      const result = await runBoardCliAsync(["contract", "validate"]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("/.board/repository.yaml");
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

    expect(result.exitCode).toBe(5);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("repository.type:");
    expect(result.stderr).toContain("repository.primary_language:");
    expect(result.stderr).toContain("Next: Fix the contract issues above");
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
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      status: "success",
      command: "contract validate",
      data: {
        path: join(directory, ".board/repository.yaml"),
        repository: "orders-service"
      },
      repository: {
        name: "orders-service"
      },
      contract: {
        path: join(directory, ".board/repository.yaml"),
        valid: true
      }
    });
  });

  it("uses --config as the contract validation path when no argument is provided", async () => {
    const directory = await createContractFixture(
      "valid-config",
      `
version: 1
repository:
  name: payments-service
  type: service
  primary_language: typescript
`
    );

    const result = await runBoardCliAsync([
      "--config",
      join(directory, ".board/repository.yaml"),
      "contract",
      "validate",
      "--json"
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: "contract validate",
      data: {
        path: join(directory, ".board/repository.yaml"),
        repository: "payments-service"
      }
    });
  });

  it("reports missing contracts with exit code 4 and a next step", async () => {
    const directory = join(tmpdir(), `board-cli-missing-contract-${randomUUID()}`);

    await mkdir(join(directory, ".git"), { recursive: true });

    const result = await runBoardCliAsync(["--cwd", directory, "contract", "validate", "--json"]);

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      status: "failure",
      command: "contract validate",
      errors: [
        {
          code: "contract-not-found"
        }
      ],
      next_steps: ["Run board init to create .board/repository.yaml."]
    });
  });
});

async function createContractFixture(name: string, yaml: string): Promise<string> {
  const directory = join(tmpdir(), `board-cli-${name}-${randomUUID()}`);

  await mkdir(join(directory, ".board"), { recursive: true });
  await writeFile(join(directory, ".board/repository.yaml"), yaml, "utf8");

  return directory;
}
