import { cp, mkdtemp, readdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  RuntimeCommandExecutor,
  RuntimeCommandRunnerInput,
  RuntimeCommandResult
} from "../src/index.js";

export const bootstrapRuntimeFixtureRepos = [
  "api-worker",
  "compose-dependency",
  "failing-setup",
  "invalid-runtime-fields",
  "minimal-node-app",
  "missing-env",
  "python-health-app"
] as const;

export type BootstrapRuntimeFixtureRepo = (typeof bootstrapRuntimeFixtureRepos)[number];

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "repos");

export function fixtureRepositoryPath(name: BootstrapRuntimeFixtureRepo): string {
  return join(fixturesRoot, name);
}

export async function listFixtureRepositories(): Promise<readonly string[]> {
  return (await readdir(fixturesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export async function copyFixtureRepository(name: BootstrapRuntimeFixtureRepo): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), `board-runtime-fixture-${name}-`)));

  await cp(fixtureRepositoryPath(name), root, {
    recursive: true
  });

  return root;
}

export function createMockRuntimeCommandExecutor(
  overrides: Readonly<Record<string, Partial<RuntimeCommandResult>>> = {}
): {
  readonly calls: RuntimeCommandRunnerInput[];
  readonly runCommand: RuntimeCommandExecutor;
} {
  const calls: RuntimeCommandRunnerInput[] = [];

  return {
    calls,
    runCommand: async (input) => {
      calls.push(input);

      return {
        id: input.id,
        command: input.command.command,
        args: input.command.args,
        cwd: input.command.cwd,
        status: "succeeded",
        exitCode: 0,
        durationMs: 1,
        stdoutExcerpt: `${input.id} mocked`,
        ...overrides[input.id]
      };
    }
  };
}
