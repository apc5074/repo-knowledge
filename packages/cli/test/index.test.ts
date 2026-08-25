import { readFile, stat, writeFile } from "node:fs/promises";
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
  runBoardCliAsync,
  resolveLocalStatePaths
} from "../src/index.js";
import {
  createRepositoryFixture,
  createTempDirectory,
  parseJsonResult,
  runCli,
  writeRepositoryContract,
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
      phase: "phase-2-cli",
      status: "implemented"
    });
  });

  it("registers implemented command names", () => {
    expect(boardCommands).toEqual([
      "init",
      "start",
      "status",
      "scan",
      "verify",
      "doctor",
      "graph",
      "legacy",
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

  it("does not register deferred command names", () => {
    for (const command of ["explain", "task"] as const) {
      const result = runBoardCli([command]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(`unknown command '${command}'`);
    }
  });

  it("renders contract group help instead of placeholder output", () => {
    const result = runBoardCli(["contract"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Repository contract commands");
    expect(result.stdout).toContain("validate");
    expect(result.stdout).not.toContain("placeholder");
  });

  it("runs board verify against a simple contract fixture", async () => {
    const fixture = await createRepositoryFixture({
      name: "verify-success",
      contract: "valid"
    });

    await writeRepositoryContract(
      fixture.root,
      `
version: 1
repository:
  name: orders-service
  type: service
  primary_language: typescript
applications:
  api:
    id: api
    type: api
    working_directory: src/api
verification:
  default:
    - id: smoke
      kind: smoke
      command:
        command: node
        args:
          - -e
          - "console.log('ready')"
`
    );

    const dataRoot = await createTempDirectory("verify-data");
    const cacheRoot = await createTempDirectory("verify-cache");
    const result = await runCli(["verify", "--json"], {
      cwd: fixture.root,
      env: {
        BOARD_DATA_HOME: dataRoot,
        BOARD_CACHE_HOME: cacheRoot
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const parsed = parseJsonResult<{
      readonly verification: {
        readonly plan: {
          readonly selectedChecks: readonly { readonly id: string }[];
        };
        readonly run: {
          readonly status: string;
          readonly results: readonly { readonly id: string; readonly status: string }[];
        };
      };
    }>(result);

    expect(parsed).toMatchObject({
      ok: true,
      status: "success",
      command: "verify",
      data: {
        verification: {
          plan: {
            selectedChecks: [expect.objectContaining({ id: "smoke" })]
          },
          run: {
            status: "passed",
            results: [expect.objectContaining({ id: "smoke", status: "passed" })]
          }
        }
      }
    });
    expect(parsed.data?.verification.history).toMatchObject({
      latest_path: expect.any(String),
      history_path: expect.any(String),
      run_path: expect.any(String)
    });

    const history = parsed.data?.verification.history as
      | {
          readonly latest_path: string;
          readonly history_path: string;
          readonly run_path: string;
        }
      | undefined;

    expect(history).toBeDefined();
    if (history !== undefined) {
      await expect(stat(history.latest_path)).resolves.toBeDefined();
      await expect(stat(history.history_path)).resolves.toBeDefined();
      const persistedRun = JSON.parse(await readFile(history.run_path, "utf8")) as {
        readonly runId: string;
      };
      expect(persistedRun.runId).toBe(parsed.data?.verification.run.runId);
    }
  });

  it("shows board verify selection flags in command help", () => {
    const result = runBoardCli(["verify", "--help"]);

    expect(result.exitCode).toBe(0);
    for (const flag of [
      "--dry-run",
      "--all",
      "--changed",
      "--since",
      "--base",
      "--paths",
      "--component",
      "--check",
      "--skip",
      "--no-default",
      "--timeout",
      "--json"
    ]) {
      expect(result.stdout).toContain(flag);
    }
  });

  it("applies board verify selection flags during dry runs", async () => {
    const fixture = await createRepositoryFixture({
      name: "verify-selection-flags",
      contract: "valid"
    });

    await writeRepositoryContract(
      fixture.root,
      `
version: 1
repository:
  name: orders-service
  type: service
  primary_language: typescript
applications:
  api:
    id: api
    type: api
    working_directory: src/api
verification:
  default:
    - id: lint
      command:
        command: node
        args:
          - -e
          - "console.log('lint')"
  rules:
    - id: api
      paths:
        - src/api/**
      components:
        - api
      checks:
        - id: api-check
          command:
            command: node
            args:
              - -e
              - "console.log('api')"
    - id: docs
      paths:
        - docs/**
      checks:
        - id: docs-check
          command:
            command: node
            args:
              - -e
              - "console.log('docs')"
`
    );

    const result = await runCli(
      [
        "verify",
        "--dry-run",
        "--json",
        "--no-default",
        "--paths",
        "src/api/routes.ts",
        "--paths",
        "docs/readme.md",
        "--component",
        "api",
        "--check",
        "lint",
        "--skip",
        "lint",
        "--timeout",
        "1"
      ],
      { cwd: fixture.root }
    );

    expect(result.exitCode).toBe(0);
    const parsed = parseJsonResult<{
      readonly verification: {
        readonly plan: {
          readonly selectedChecks: readonly { readonly id: string }[];
          readonly skippedChecks: readonly { readonly id: string }[];
        };
        readonly run: { readonly results: readonly unknown[] };
      };
    }>(result);

    expect(parsed.data?.verification.plan.selectedChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "api-check" }),
        expect.objectContaining({ id: "docs-check" })
      ])
    );
    expect(parsed.data?.verification.plan.selectedChecks).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "lint" })])
    );
    expect(parsed.data?.verification.plan.skippedChecks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "lint" })])
    );
    expect(parsed.data?.verification.run.results).toEqual([]);
  });

  it("runs no checks for changed-only verification when nothing changed", async () => {
    const fixture = await createRepositoryFixture({
      name: "verify-changed-only",
      contract: "valid"
    });

    await writeVerificationMatrixContract(fixture.root);
    const env = await createCliStateEnv("verify-changed-only");

    const result = await runCli(["verify", "--changed", "--json"], {
      cwd: fixture.root,
      env
    });

    expect(result.exitCode).toBe(0);
    expect(parseJsonResult(result)).toMatchObject({
      ok: true,
      data: {
        verification: {
          plan: {
            selectedChecks: []
          },
          run: {
            status: "not_configured",
            results: []
          }
        }
      }
    });
  });

  it("selects checks for explicit board verify paths", async () => {
    const fixture = await createRepositoryFixture({
      name: "verify-explicit-path",
      contract: "valid"
    });

    await writeVerificationMatrixContract(fixture.root);
    const env = await createCliStateEnv("verify-explicit-path");

    const result = await runCli(
      ["verify", "--dry-run", "--json", "--no-default", "--paths", "src/api/routes.ts"],
      { cwd: fixture.root, env }
    );

    expect(result.exitCode).toBe(0);
    expect(parseJsonResult(result)).toMatchObject({
      ok: true,
      data: {
        verification: {
          plan: {
            selectedChecks: [expect.objectContaining({ id: "api-check" })]
          },
          run: {
            results: []
          }
        }
      }
    });
  });

  it("selects checks for explicit board verify components", async () => {
    const fixture = await createRepositoryFixture({
      name: "verify-explicit-component",
      contract: "valid"
    });

    await writeVerificationMatrixContract(fixture.root);
    const env = await createCliStateEnv("verify-explicit-component");

    const result = await runCli(
      ["verify", "--dry-run", "--json", "--no-default", "--component", "api"],
      { cwd: fixture.root, env }
    );

    expect(result.exitCode).toBe(0);
    expect(parseJsonResult(result)).toMatchObject({
      ok: true,
      data: {
        verification: {
          plan: {
            selectedChecks: [expect.objectContaining({ id: "api-check" })]
          },
          run: {
            results: []
          }
        }
      }
    });
  });

  it("runs explicit board verify checks", async () => {
    const fixture = await createRepositoryFixture({
      name: "verify-explicit-check",
      contract: "valid"
    });

    await writeVerificationMatrixContract(fixture.root);
    const env = await createCliStateEnv("verify-explicit-check");

    const result = await runCli(["verify", "--json", "--no-default", "--check", "api-check"], {
      cwd: fixture.root,
      env
    });

    expect(result.exitCode).toBe(0);
    expect(parseJsonResult(result)).toMatchObject({
      ok: true,
      data: {
        verification: {
          plan: {
            selectedChecks: [expect.objectContaining({ id: "api-check" })]
          },
          run: {
            status: "passed",
            results: [expect.objectContaining({ id: "api-check", status: "passed" })]
          }
        }
      }
    });
  });

  it("reports missing board verify config clearly", async () => {
    const fixture = await createRepositoryFixture({
      name: "verify-no-config",
      contract: "missing"
    });

    const result = await runCli(["verify", "--json"], {
      cwd: fixture.root
    });

    expect(result.exitCode).toBe(1);
    expect(parseJsonResult(result)).toMatchObject({
      ok: false,
      command: "verify",
      errors: [expect.objectContaining({ code: "contract-not-found" })],
      next_steps: ["Run board init to create .board/repository.yaml."]
    });
  });

  it("rejects conflicting board verify selection flags", async () => {
    const fixture = await createRepositoryFixture({
      name: "verify-invalid-flags",
      contract: "valid"
    });

    const result = await runCli(["verify", "--json", "--base", "HEAD", "--since", "HEAD"], {
      cwd: fixture.root
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(parseJsonResult(result)).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: "usage-error" })]
    });
  });

  it("records failed board verify runs in local history", async () => {
    const fixture = await createRepositoryFixture({
      name: "verify-failure-history",
      contract: "valid"
    });

    await writeRepositoryContract(
      fixture.root,
      `
version: 1
repository:
  name: orders-service
  type: service
  primary_language: typescript
verification:
  default:
    - id: fail
      command:
        command: node
        args:
          - -e
          - "console.error('nope'); process.exit(2)"
`
    );

    const dataRoot = await createTempDirectory("verify-failed-data");
    const cacheRoot = await createTempDirectory("verify-failed-cache");
    const result = await runCli(["verify", "--json"], {
      cwd: fixture.root,
      env: {
        BOARD_DATA_HOME: dataRoot,
        BOARD_CACHE_HOME: cacheRoot
      }
    });

    expect(result.exitCode).toBe(1);
    const parsed = parseJsonResult<{
      readonly verification: {
        readonly run: { readonly runId: string; readonly status: string };
        readonly history: { readonly run_path: string };
      };
    }>(result);
    expect(parsed.data?.verification.run.status).toBe("failed");

    const persistedRun = JSON.parse(
      await readFile(parsed.data?.verification.history.run_path ?? "", "utf8")
    ) as { readonly runId: string; readonly status: string };
    expect(persistedRun).toMatchObject({
      runId: parsed.data?.verification.run.runId,
      status: "failed"
    });
  });

  it("previews board start without executing runtime state writes", async () => {
    const fixture = await createRepositoryFixture({
      name: "start-dry-run",
      contract: "valid"
    });
    const dataRoot = await createTempDirectory("start-dry-run-data");
    const cacheRoot = await createTempDirectory("start-dry-run-cache");
    const result = await runCli(["start", "--dry-run"], {
      cwd: fixture.root,
      env: {
        BOARD_DATA_HOME: dataRoot,
        BOARD_CACHE_HOME: cacheRoot
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Built bootstrap runtime dry-run plan.");
    const localState = resolveLocalStatePaths({
      env: {
        BOARD_DATA_HOME: dataRoot,
        BOARD_CACHE_HOME: cacheRoot,
        HOME: process.env.HOME
      },
      repositoryRoot: {
        ok: true,
        root: fixture.root,
        foundBy: "git",
        startDirectory: fixture.root
      }
    });

    await expect(
      stat(join(localState.repositoryStateRoot ?? dataRoot, "runtime", "latest.json"))
    ).rejects.toThrow();
  });

  it("returns structured runtime JSON output for board start", async () => {
    const fixture = await createRepositoryFixture({
      name: "start-json",
      contract: "valid"
    });
    const dataRoot = await createTempDirectory("start-json-data");
    const cacheRoot = await createTempDirectory("start-json-cache");
    const result = await runCli(["start", "--json"], {
      cwd: fixture.root,
      env: {
        BOARD_DATA_HOME: dataRoot,
        BOARD_CACHE_HOME: cacheRoot
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      status: "success",
      command: "start",
      data: {
        runtime: {
          status: "succeeded",
          plan: {
            repositoryRoot: fixture.root
          },
          session: {
            id: expect.stringMatching(/^local-/),
            repositoryRoot: fixture.root,
            status: "succeeded"
          },
          report: {
            status: "succeeded",
            steps: {
              total: expect.any(Number)
            },
            resources: {
              total: expect.any(Number)
            },
            failedStepIds: [],
            failedResourceIds: []
          }
        }
      }
    });
  });

  it("uses shared contract errors for missing board start contracts", async () => {
    const fixture = await createRepositoryFixture({
      name: "start-missing",
      contract: "missing"
    });
    const result = await runCli(["start", "--json"], { cwd: fixture.root });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toBe("");
    expect(parseJsonResult(result)).toMatchObject({
      ok: false,
      status: "failure",
      command: "start",
      errors: [
        {
          code: "contract-not-found"
        }
      ],
      next_steps: ["Run board init to create .board/repository.yaml."]
    });
  });

  it("previews board init output without writing files", async () => {
    const root = await createPackageRepository("init-dry-run");
    const result = await runCli(["init", "--dry-run", "--include-untracked"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("board init proposal");
    expect(result.stdout).toContain("Proposed files:");
    expect(result.stdout).toContain("Diff .board/repository.yaml");
    await expect(stat(join(root, ".board/repository.yaml"))).rejects.toThrow();
  });

  it("returns structured board init JSON output", async () => {
    const root = await createPackageRepository("init-json");
    const result = await runCli(["init", "--json", "--include-untracked"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const parsed = parseJsonResult<{
      readonly init: {
        readonly proposalId: string;
      };
      readonly review: {
        readonly approvalRequiredItems: readonly unknown[];
      };
    }>(result);

    expect(parsed).toMatchObject({
      ok: true,
      status: expect.stringMatching(/success|warning/),
      command: "init",
      approval_required: true,
      data: {
        init: {
          proposalId: expect.stringMatching(/^proposal-local-/)
        },
        review: {
          proposedFiles: expect.arrayContaining([
            expect.objectContaining({
              path: ".board/repository.yaml"
            })
          ])
        }
      }
    });
    expect(parsed.data?.review.approvalRequiredItems.length).toBeGreaterThan(0);
  });

  it("writes board init artifacts when explicitly requested", async () => {
    const root = await createPackageRepository("init-write");
    const result = await runCli(["init", "--write", "--include-untracked"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("board init applied");
    await expect(readFile(join(root, ".board/repository.yaml"), "utf8")).resolves.toContain(
      "repository:"
    );
  });

  it("reports invalid existing contracts without overwriting them", async () => {
    const root = await createInvalidContractRepository("init-invalid-human");
    const original = await readFile(join(root, ".board/repository.yaml"), "utf8");
    const result = await runCli(["init", "--write", "--include-untracked"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Existing repository contract is invalid");
    expect(result.stdout).toContain("skip .board/repository.yaml");
    expect(result.stdout).toContain("create .board/repository.generated.yaml");
    expect(result.stdout).toContain("Next: Repair .board/repository.yaml");
    await expect(readFile(join(root, ".board/repository.yaml"), "utf8")).resolves.toBe(original);
    await expect(
      readFile(join(root, ".board/repository.generated.yaml"), "utf8")
    ).resolves.toContain("repository:");
  });

  it("returns path-aware JSON details for invalid existing contracts", async () => {
    const root = await createInvalidContractRepository("init-invalid-json");
    const result = await runCli(["init", "--json", "--include-untracked"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const parsed = parseJsonResult<{
      readonly review: {
        readonly approvalRequiredItems: readonly {
          readonly id: string;
          readonly summary: string;
          readonly evidence: readonly string[];
        }[];
        readonly proposedFiles: readonly {
          readonly path: string;
          readonly action: string;
        }[];
      };
    }>(result);
    const invalidItem = parsed.data?.review.approvalRequiredItems.find(
      (item) => item.id === "existing-contract-invalid"
    );

    expect(parsed).toMatchObject({
      ok: true,
      status: "warning",
      command: "init",
      data: {
        review: {
          proposedFiles: expect.arrayContaining([
            expect.objectContaining({
              path: ".board/repository.yaml",
              action: "skip"
            }),
            expect.objectContaining({
              path: ".board/repository.generated.yaml",
              action: "create"
            })
          ])
        }
      }
    });
    expect(invalidItem?.summary).toContain("repository.type:");
    expect(invalidItem?.evidence).toEqual(
      expect.arrayContaining([expect.stringContaining("repository.primary_language:")])
    );
  });

  it("scans a repository fixture with human-readable output", async () => {
    const fixtureRoot = join(packageRoot, "../scanner-core/test/fixtures/repos/typescript-api");
    const result = await runCli(["scan", "--include-untracked"], {
      cwd: fixtureRoot
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Scanned ");
    expect(result.stdout).toContain(" facts");
  });

  it("scans a repository fixture with structured JSON output", async () => {
    const fixtureRoot = join(packageRoot, "../scanner-core/test/fixtures/repos/typescript-api");
    const result = await runCli(["scan", "--json", "--include-untracked"], {
      cwd: fixtureRoot
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const parsed = parseJsonResult<{
      readonly scan: {
        readonly facts: readonly { readonly kind: string; readonly evidence: readonly unknown[] }[];
        readonly warnings: readonly unknown[];
        readonly errors: readonly unknown[];
        readonly stats: { readonly files_in_inventory: number };
      };
    }>(result);

    expect(parsed).toMatchObject({
      ok: true,
      command: "scan",
      data: {
        scan: {
          tool_name: "scan_repository",
          errors: [],
          stats: {
            files_in_inventory: expect.any(Number)
          }
        }
      }
    });
    expect(parsed.data?.scan.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "framework.detected",
          evidence: expect.any(Array)
        }),
        expect.objectContaining({
          kind: "database.dependency_detected",
          evidence: expect.any(Array)
        })
      ])
    );
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

  it("reports valid repository status and clear absence of runtime state", async () => {
    const fixture = await createRepositoryFixture({
      name: "status-valid",
      contract: "valid"
    });

    const result = await runCli(["status"], { cwd: fixture.root, json: true });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJsonResult(result)).toMatchObject({
      ok: true,
      status: "warning",
      command: "status",
      summary:
        "Repository found; contract valid. No runtime session has been recorded for this repository.",
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
          available: true,
          status: "unknown",
          summary: "No runtime session has been recorded for this repository."
        }
      },
      repository: {
        root: fixture.root,
        name: "orders-service"
      },
      contract: {
        valid: true
      },
      next_steps: ["Run board start before requesting runtime status."]
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
      status: "warning",
      command: "status",
      summary:
        "Repository found; contract missing. No runtime session has been recorded for this repository.",
      data: {
        repository: {
          found: true,
          root: fixture.root
        },
        contract: {
          found: false,
          valid: false,
          reason: "contract-not-found"
        },
        runtime: {
          available: true,
          status: "unknown"
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
      status: "warning",
      command: "status",
      summary:
        "Repository found; contract invalid. No runtime session has been recorded for this repository.",
      data: {
        contract: {
          valid: false,
          reason: "contract-invalid"
        },
        runtime: {
          available: true,
          status: "unknown"
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
          available: false
        }
      },
      next_steps: ["Run board init from the repository root."]
    });
  });

  it("reports a running runtime session through board status", async () => {
    const fixture = await createRepositoryFixture({
      name: "status-runtime",
      contract: "valid"
    });
    const dataRoot = await createTempDirectory("status-runtime-data");
    const cacheRoot = await createTempDirectory("status-runtime-cache");

    await runCli(["start", "--json"], {
      cwd: fixture.root,
      env: {
        BOARD_DATA_HOME: dataRoot,
        BOARD_CACHE_HOME: cacheRoot
      }
    });

    const result = await runCli(["status", "--json"], {
      cwd: fixture.root,
      env: {
        BOARD_DATA_HOME: dataRoot,
        BOARD_CACHE_HOME: cacheRoot
      }
    });

    expect(result.exitCode).toBe(0);
    expect(parseJsonResult(result)).toMatchObject({
      ok: true,
      command: "status",
      data: {
        runtime: {
          available: true,
          status: "succeeded",
          session: {
            status: "succeeded",
            repositoryRoot: fixture.root
          }
        }
      }
    });
  });

  it("stops the latest Board-managed runtime session through board stop", async () => {
    const fixture = await createRepositoryFixture({
      name: "stop-runtime",
      contract: "valid"
    });
    const dataRoot = await createTempDirectory("stop-runtime-data");
    const cacheRoot = await createTempDirectory("stop-runtime-cache");

    await runCli(["start", "--json"], {
      cwd: fixture.root,
      env: {
        BOARD_DATA_HOME: dataRoot,
        BOARD_CACHE_HOME: cacheRoot
      }
    });

    const result = await runCli(["stop", "--json"], {
      cwd: fixture.root,
      env: {
        BOARD_DATA_HOME: dataRoot,
        BOARD_CACHE_HOME: cacheRoot
      }
    });

    expect(result.exitCode).toBe(0);
    expect(parseJsonResult(result)).toMatchObject({
      ok: true,
      command: "stop",
      data: {
        runtime: {
          status: "stopped",
          stopped_session_ids: [expect.stringMatching(/^local-/)]
        }
      }
    });
  });

  it("reports missing runtime sessions clearly through board stop", async () => {
    const fixture = await createRepositoryFixture({
      name: "stop-missing",
      contract: "valid"
    });

    const result = await runCli(["stop", "--json"], { cwd: fixture.root });

    expect(result.exitCode).toBe(1);
    expect(parseJsonResult(result)).toMatchObject({
      ok: false,
      command: "stop",
      summary: "No Board-managed runtime session is available to stop.",
      next_steps: ["Run board status or board start to create a runtime session first."]
    });
  });
});

async function createPackageRepository(name: string): Promise<string> {
  const root = await createTempDirectory(name);

  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name,
        scripts: {
          test: "vitest run"
        },
        dependencies: {
          express: "^5.0.0"
        }
      },
      null,
      2
    ),
    "utf8"
  );

  return root;
}

async function createInvalidContractRepository(name: string): Promise<string> {
  const root = await createPackageRepository(name);

  await writeContract(
    root,
    [
      "version: 1",
      "repository:",
      `  name: ${name}`,
      "  type: daemon",
      "  primary_language: ruby",
      ""
    ].join("\n")
  );

  return root;
}

async function createCliStateEnv(name: string): Promise<NodeJS.ProcessEnv> {
  return {
    BOARD_DATA_HOME: await createTempDirectory(`${name}-data`),
    BOARD_CACHE_HOME: await createTempDirectory(`${name}-cache`)
  };
}

async function writeVerificationMatrixContract(root: string): Promise<void> {
  await writeRepositoryContract(
    root,
    `
version: 1
repository:
  name: verification-matrix
  type: service
  primary_language: typescript
applications:
  api:
    id: api
    type: api
    working_directory: src/api
verification:
  default:
    - id: lint
      command:
        command: node
        args:
          - -e
          - "console.log('lint')"
  rules:
    - id: api
      paths:
        - src/api/**
      components:
        - api
      checks:
        - id: api-check
          command:
            command: node
            args:
              - -e
              - "console.log('api')"
    - id: docs
      paths:
        - docs/**
      checks:
        - id: docs-check
          command:
            command: node
            args:
              - -e
              - "console.log('docs')"
`
  );
}
