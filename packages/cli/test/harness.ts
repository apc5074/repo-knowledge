import { randomUUID } from "node:crypto";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCommandContext,
  runBoardCliAsync,
  type CliResult,
  type CommandContext,
  type CommandContextInput,
  type CommandResult
} from "../src/index.js";

export type ContractFixtureState = "valid" | "invalid" | "missing";

export type RepositoryFixtureInput = {
  readonly name: string;
  readonly contract?: ContractFixtureState;
  readonly git?: boolean;
};

export type RepositoryFixture = {
  readonly root: string;
  readonly contractPath: string;
};

export type RuntimeFixtureRepository =
  | "api-worker"
  | "compose-dependency"
  | "failing-setup"
  | "invalid-runtime-fields"
  | "minimal-node-app"
  | "missing-env"
  | "python-health-app";

export type CliHarnessRunOptions = {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly json?: boolean;
};

export async function createTempDirectory(name: string): Promise<string> {
  const directory = join(tmpdir(), `board-cli-${name}-${randomUUID()}`);

  await mkdir(directory, { recursive: true });

  return directory;
}

export async function createRepositoryFixture(
  input: RepositoryFixtureInput
): Promise<RepositoryFixture> {
  const root = await createTempDirectory(input.name);
  const contractPath = join(root, ".board/repository.yaml");

  if (input.git !== false) {
    await mkdir(join(root, ".git"), { recursive: true });
  }

  if (input.contract === "valid") {
    await writeContract(root, validRepositoryContractYaml());
  }

  if (input.contract === "invalid") {
    await writeContract(root, invalidRepositoryContractYaml());
  }

  return {
    root,
    contractPath
  };
}

export async function copyRuntimeFixtureRepository(
  name: RuntimeFixtureRepository
): Promise<RepositoryFixture> {
  const root = await createTempDirectory(`runtime-${name}`);

  await cp(runtimeFixtureRepositoryPath(name), root, {
    recursive: true
  });
  await mkdir(join(root, ".git"), { recursive: true });

  return {
    root,
    contractPath: join(root, ".board/repository.yaml")
  };
}

export async function writeContract(root: string, yaml: string): Promise<string> {
  const contractPath = join(root, ".board/repository.yaml");

  await mkdir(join(root, ".board"), { recursive: true });
  await writeFile(contractPath, yaml, "utf8");

  return contractPath;
}

export async function runCli(
  args: readonly string[],
  options: CliHarnessRunOptions = {}
): Promise<CliResult> {
  return withEnvironment(options.env, () =>
    runBoardCliAsync([
      ...(options.json === true ? ["--json"] : []),
      ...(options.cwd === undefined ? [] : ["--cwd", options.cwd]),
      ...args
    ])
  );
}

export function parseJsonResult<TData = unknown>(result: CliResult): CommandResult<TData> {
  return JSON.parse(result.stdout) as CommandResult<TData>;
}

export function createHarnessContext(input: CommandContextInput = {}): CommandContext {
  return createCommandContext({
    sessionId: "local-00000000-0000-4000-8000-000000000001",
    ...input
  });
}

export function validRepositoryContractYaml(name = "orders-service"): string {
  return `
version: 1
repository:
  name: ${name}
  type: service
  primary_language: typescript
`;
}

export function invalidRepositoryContractYaml(name = "orders-service"): string {
  return `
version: 1
repository:
  name: ${name}
  type: daemon
  primary_language: ruby
`;
}

function runtimeFixtureRepositoryPath(name: RuntimeFixtureRepository): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "bootstrap-runtime",
    "test",
    "fixtures",
    "repos",
    name
  );
}

async function withEnvironment<T>(
  env: NodeJS.ProcessEnv | undefined,
  callback: () => Promise<T>
): Promise<T> {
  if (env === undefined) {
    return callback();
  }

  const previous = { ...process.env };

  try {
    process.env = {
      ...previous,
      ...env
    };

    return await callback();
  } finally {
    process.env = previous;
  }
}
