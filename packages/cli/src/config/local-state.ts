import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { RepositoryRootResult } from "./repository-root.js";

export type LocalStatePlatform = NodeJS.Platform;

export type LocalStatePaths = {
  readonly dataRoot: string;
  readonly cacheRoot: string;
  readonly logsRoot: string;
  readonly sessionsRoot: string;
  readonly repositoriesRoot: string;
  readonly repositoryStateRoot?: string;
  readonly repositoryKey?: string;
};

export type ResolveLocalStatePathsInput = {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: LocalStatePlatform;
  readonly repositoryRoot?: RepositoryRootResult;
};

export function resolveLocalStatePaths(input: ResolveLocalStatePathsInput = {}): LocalStatePaths {
  const env = input.env ?? process.env;
  const platform = input.platform ?? process.platform;
  const dataRoot = resolveDataRoot(env, platform);
  const cacheRoot = resolveCacheRoot(env, platform);
  const repositoriesRoot = join(dataRoot, "repositories");
  const repositoryKey = input.repositoryRoot?.ok
    ? createRepositoryStateKey(input.repositoryRoot.root)
    : undefined;

  return {
    dataRoot,
    cacheRoot,
    logsRoot: join(dataRoot, "logs"),
    sessionsRoot: join(dataRoot, "sessions"),
    repositoriesRoot,
    repositoryStateRoot:
      repositoryKey === undefined ? undefined : join(repositoriesRoot, repositoryKey),
    repositoryKey
  };
}

export async function ensureLocalStateDirectories(
  paths: LocalStatePaths
): Promise<LocalStatePaths> {
  await mkdir(paths.dataRoot, { recursive: true });
  await mkdir(paths.cacheRoot, { recursive: true });
  await mkdir(paths.logsRoot, { recursive: true });
  await mkdir(paths.sessionsRoot, { recursive: true });
  await mkdir(paths.repositoriesRoot, { recursive: true });

  if (paths.repositoryStateRoot !== undefined) {
    await mkdir(paths.repositoryStateRoot, { recursive: true });
  }

  return paths;
}

export function createRepositoryStateKey(repositoryRoot: string): string {
  return createHash("sha256").update(resolve(repositoryRoot)).digest("hex").slice(0, 24);
}

function resolveDataRoot(env: NodeJS.ProcessEnv, platform: LocalStatePlatform): string {
  if (env.BOARD_DATA_HOME !== undefined && env.BOARD_DATA_HOME.length > 0) {
    return resolve(env.BOARD_DATA_HOME);
  }

  if (platform === "darwin") {
    return join(resolveHome(env), "Library/Application Support/board");
  }

  if (env.XDG_DATA_HOME !== undefined && env.XDG_DATA_HOME.length > 0) {
    return join(resolve(env.XDG_DATA_HOME), "board");
  }

  return join(resolveHome(env), ".local/share/board");
}

function resolveCacheRoot(env: NodeJS.ProcessEnv, platform: LocalStatePlatform): string {
  if (env.BOARD_CACHE_HOME !== undefined && env.BOARD_CACHE_HOME.length > 0) {
    return resolve(env.BOARD_CACHE_HOME);
  }

  if (platform === "darwin") {
    return join(resolveHome(env), "Library/Caches/board");
  }

  if (env.XDG_CACHE_HOME !== undefined && env.XDG_CACHE_HOME.length > 0) {
    return join(resolve(env.XDG_CACHE_HOME), "board");
  }

  return join(resolveHome(env), ".cache/board");
}

function resolveHome(env: NodeJS.ProcessEnv): string {
  return resolve(env.HOME ?? process.cwd());
}
