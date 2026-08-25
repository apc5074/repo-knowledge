import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryFixture } from "./harness.js";

const execFileAsync = promisify(execFile);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(packageRoot));
const boardEntrypoint = join(packageRoot, "dist/index.js");

type ProcessResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

describe("board CLI E2E smoke tests", () => {
  beforeAll(async () => {
    await execFileAsync("pnpm", ["--filter", "@repo-knowledge/repository-contract", "build"], {
      cwd: repositoryRoot
    });
    await execFileAsync("pnpm", ["--filter", "@repo-knowledge/init-core", "build"], {
      cwd: repositoryRoot
    });
    await execFileAsync("pnpm", ["--filter", "@repo-knowledge/cli", "build"], {
      cwd: repositoryRoot
    });
  }, 60_000);

  it("prints help from the built entrypoint", async () => {
    const result = await runBuiltBoard(["--help"]);

    expect(result.exitCode).toBe(0);
    expectNoApplicationStderr(result);
    expect(result.stdout).toContain("Usage: board");
    expect(result.stdout).toContain("status");
    expect(result.stdout).toContain("contract");
  });

  it("prints version from the built entrypoint", async () => {
    const result = await runBuiltBoard(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("0.0.0");
    expectNoApplicationStderr(result);
  });

  it("reports repository status as JSON from the built entrypoint", async () => {
    const fixture = await createRepositoryFixture({
      name: "e2e-status",
      contract: "valid"
    });
    const result = await runBuiltBoard(["--json", "--cwd", fixture.root, "status"]);

    expect(result.exitCode).toBe(0);
    expectNoApplicationStderr(result);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: "status",
      data: {
        repository: {
          root: fixture.root
        },
        contract: {
          valid: true
        }
      }
    });
  });

  it("validates a contract from the built entrypoint", async () => {
    const fixture = await createRepositoryFixture({
      name: "e2e-contract",
      contract: "valid"
    });

    const result = await runBuiltBoard(["contract", "validate", fixture.contractPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`Valid repository contract: ${fixture.contractPath}`);
    expectNoApplicationStderr(result);
  });

  it("fails clearly for unknown commands from the built entrypoint", async () => {
    const result = await runBuiltBoard(["unknown"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("unknown command 'unknown'");
  });
});

async function runBuiltBoard(args: readonly string[]): Promise<ProcessResult> {
  try {
    const result = await execFileAsync(process.execPath, [boardEntrypoint, ...args], {
      cwd: repositoryRoot
    });

    return {
      exitCode: 0,
      stdout: result.stdout.trimEnd(),
      stderr: result.stderr.trimEnd()
    };
  } catch (error) {
    if (isExecError(error)) {
      return {
        exitCode: error.code,
        stdout: error.stdout.trimEnd(),
        stderr: error.stderr.trimEnd()
      };
    }

    throw error;
  }
}

function isExecError(
  error: unknown
): error is Error & { readonly code: number; readonly stdout: string; readonly stderr: string } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "number" &&
    "stdout" in error &&
    typeof error.stdout === "string" &&
    "stderr" in error &&
    typeof error.stderr === "string"
  );
}

function expectNoApplicationStderr(result: ProcessResult): void {
  expect(stripKnownNodeRuntimeWarnings(result.stderr)).toBe("");
}

function stripKnownNodeRuntimeWarnings(stderr: string): string {
  return stderr
    .replace(
      /^\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature and might change at any time\n\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)$/,
      ""
    )
    .trim();
}
