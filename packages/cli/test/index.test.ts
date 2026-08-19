import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
import {
  createRepositoryFixture,
  createTempDirectory,
  parseJsonResult,
  runCli,
  validRepositoryContractYaml,
  writeContract
} from "./harness.js";

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

    for (const command of boardCommands) {
      const result = runBoardCli([command, "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(command);
    }
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

  it("returns placeholder output for commands still deferred past Phase 2", () => {
    for (const command of boardCommands.filter((command) => command !== "status")) {
      expect(runBoardCli([command])).toEqual({
        exitCode: 0,
        stdout: `board ${command} is a Phase 2 placeholder. Implementation belongs to a later phase.`,
        stderr: ""
      });
    }
  });

  it("returns machine-readable placeholder output for MVP commands", () => {
    const result = runBoardCli(["--json", "init"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      status: "success",
      command: "init",
      summary: "board init is a Phase 2 placeholder. Implementation belongs to a later phase."
    });
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
    const fixture = await createRepositoryFixture({
      name: "valid-human",
      contract: "valid",
      git: false
    });

    await expect(runCli(["contract", "validate", fixture.contractPath])).resolves.toEqual({
      exitCode: 0,
      stdout: `Valid repository contract: ${fixture.contractPath}`,
      stderr: ""
    });
  });

  it("uses .board/repository.yaml as the default validation path", async () => {
    const fixture = await createRepositoryFixture({
      name: "valid-default",
      contract: "valid",
      git: false
    });
    const previousWorkingDirectory = process.cwd();

    try {
      process.chdir(fixture.root);

      const result = await runBoardCliAsync(["contract", "validate"]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("/.board/repository.yaml");
    } finally {
      process.chdir(previousWorkingDirectory);
    }
  });

  it("returns path-aware validation errors for invalid contracts", async () => {
    const fixture = await createRepositoryFixture({
      name: "invalid-human",
      contract: "invalid",
      git: false
    });

    const result = await runCli(["contract", "validate", fixture.contractPath]);

    expect(result.exitCode).toBe(5);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("repository.type:");
    expect(result.stderr).toContain("repository.primary_language:");
    expect(result.stderr).toContain("Next: Fix the contract issues above");
  });

  it("supports JSON validation output", async () => {
    const fixture = await createRepositoryFixture({
      name: "valid-json",
      contract: "valid",
      git: false
    });

    const result = await runCli(["contract", "validate", fixture.contractPath], { json: true });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJsonResult(result)).toMatchObject({
      ok: true,
      status: "success",
      command: "contract validate",
      data: {
        path: fixture.contractPath,
        repository: "orders-service"
      },
      repository: {
        name: "orders-service"
      },
      contract: {
        path: fixture.contractPath,
        valid: true
      }
    });
  });

  it("includes validation details for invalid JSON contract validation output", async () => {
    const fixture = await createRepositoryFixture({
      name: "invalid-json",
      contract: "invalid",
      git: false
    });

    const result = await runCli(["contract", "validate", fixture.contractPath], { json: true });

    expect(result.exitCode).toBe(5);
    expect(result.stderr).toBe("");
    expect(parseJsonResult(result)).toMatchObject({
      ok: false,
      status: "failure",
      command: "contract validate",
      errors: [
        {
          code: "contract-invalid",
          path: fixture.contractPath,
          details: [
            {
              path: "repository.type"
            },
            {
              path: "repository.primary_language"
            }
          ]
        },
        {
          code: "contract-issue",
          path: "repository.type"
        },
        {
          code: "contract-issue",
          path: "repository.primary_language"
        }
      ],
      contract: {
        path: fixture.contractPath,
        valid: false
      },
      next_steps: ["Fix the contract issues above, then run board contract validate again."]
    });
  });

  it("uses --config as the contract validation path when no argument is provided", async () => {
    const fixture = await createRepositoryFixture({
      name: "valid-config",
      git: false
    });

    await writeContract(fixture.root, validRepositoryContractYaml("payments-service"));

    const result = await runCli([
      "--config",
      fixture.contractPath,
      "contract",
      "validate",
      "--json"
    ]);

    expect(result.exitCode).toBe(0);
    expect(parseJsonResult(result)).toMatchObject({
      ok: true,
      command: "contract validate",
      data: {
        path: fixture.contractPath,
        repository: "payments-service"
      }
    });
  });

  it("reports missing contracts with exit code 4 and a next step", async () => {
    const fixture = await createRepositoryFixture({
      name: "missing-contract",
      contract: "missing"
    });

    const result = await runCli(["contract", "validate"], { cwd: fixture.root, json: true });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toBe("");
    expect(parseJsonResult(result)).toMatchObject({
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

  it("reports valid repository status without claiming runtime services are running", async () => {
    const fixture = await createRepositoryFixture({
      name: "status-valid",
      contract: "valid"
    });

    const result = await runCli(["status"], { cwd: fixture.root, json: true });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJsonResult(result)).toMatchObject({
      ok: true,
      status: "success",
      command: "status",
      summary: "Repository found; contract valid.",
      data: {
        repository: {
          found: true,
          root: fixture.root
        },
        contract: {
          found: true,
          valid: true,
          repository_name: "orders-service"
        },
        cli: {
          version: "0.0.0"
        },
        runtime: {
          managed_services_running: false
        }
      },
      repository: {
        root: fixture.root,
        name: "orders-service"
      },
      contract: {
        valid: true
      },
      next_steps: []
    });
  });

  it("reports missing contracts through board status", async () => {
    const fixture = await createRepositoryFixture({
      name: "status-missing",
      contract: "missing"
    });

    const result = await runCli(["status"], { cwd: fixture.root, json: true });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJsonResult(result)).toMatchObject({
      ok: true,
      command: "status",
      summary: "Repository found; contract missing.",
      data: {
        repository: {
          found: true,
          root: fixture.root
        },
        contract: {
          found: false,
          valid: false,
          reason: "contract-not-found"
        }
      },
      next_steps: ["Run board init to create .board/repository.yaml."]
    });
  });

  it("reports invalid contracts through board status", async () => {
    const fixture = await createRepositoryFixture({
      name: "status-invalid",
      contract: "invalid"
    });

    const result = await runCli(["status"], { cwd: fixture.root, json: true });
    const payload = parseJsonResult(result) as {
      readonly warnings: readonly string[];
      readonly data: {
        readonly contract: {
          readonly valid: boolean;
          readonly reason: string;
        };
      };
    };

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload).toMatchObject({
      ok: true,
      command: "status",
      summary: "Repository found; contract invalid.",
      data: {
        contract: {
          valid: false,
          reason: "contract-invalid"
        }
      },
      contract: {
        valid: false
      },
      next_steps: ["Fix the contract issues above, then run board contract validate again."]
    });
    expect(payload.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("repository.type:"),
        expect.stringContaining("repository.primary_language:")
      ])
    );
  });

  it("reports no repository through board status", async () => {
    const directory = await createTempDirectory("status-no-repo");

    const result = await runCli(["status"], { cwd: directory, json: true });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJsonResult(result)).toMatchObject({
      ok: true,
      command: "status",
      summary: "Repository not found.",
      data: {
        repository: {
          found: false,
          reason: "not-found"
        },
        runtime: {
          managed_services_running: false
        }
      },
      next_steps: ["Run board init from the repository root."]
    });
  });
});
