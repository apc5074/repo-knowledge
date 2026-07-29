import { stat } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

export type RepositoryRootFoundBy = "git" | "board-contract";

export type RepositoryRootResult =
  | {
      readonly ok: true;
      readonly root: string;
      readonly foundBy: RepositoryRootFoundBy;
      readonly startDirectory: string;
    }
  | {
      readonly ok: false;
      readonly reason: "not-found";
      readonly startDirectory: string;
      readonly message: string;
    };

export async function discoverRepositoryRoot(
  startDirectory: string
): Promise<RepositoryRootResult> {
  const resolvedStartDirectory = resolve(startDirectory);
  let currentDirectory = resolvedStartDirectory;

  while (true) {
    if (await pathExists(join(currentDirectory, ".git"))) {
      return {
        ok: true,
        root: currentDirectory,
        foundBy: "git",
        startDirectory: resolvedStartDirectory
      };
    }

    if (await pathExists(join(currentDirectory, ".board/repository.yaml"))) {
      return {
        ok: true,
        root: currentDirectory,
        foundBy: "board-contract",
        startDirectory: resolvedStartDirectory
      };
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory || currentDirectory === parse(currentDirectory).root) {
      return {
        ok: false,
        reason: "not-found",
        startDirectory: resolvedStartDirectory,
        message: `Could not find a repository root from ${resolvedStartDirectory}`
      };
    }

    currentDirectory = parentDirectory;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
