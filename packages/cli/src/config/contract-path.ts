import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { RepositoryRootResult } from "./repository-root.js";

export const defaultContractRelativePath = ".board/repository.yaml";

export type ContractPathSource = "config" | "argument" | "repository-default";

export type ContractPathResult =
  | {
      readonly ok: true;
      readonly path: string;
      readonly source: ContractPathSource;
      readonly repositoryRoot?: string;
    }
  | {
      readonly ok: false;
      readonly reason: "repository-not-found" | "contract-not-found";
      readonly attemptedPath?: string;
      readonly repositoryRoot?: string;
      readonly message: string;
      readonly nextSteps: readonly string[];
    };

export type ResolveContractPathInput = {
  readonly currentWorkingDirectory: string;
  readonly explicitPath?: string;
  readonly explicitPathSource?: Extract<ContractPathSource, "config" | "argument">;
  readonly repositoryRoot: RepositoryRootResult;
};

export async function resolveContractPath(
  input: ResolveContractPathInput
): Promise<ContractPathResult> {
  if (input.explicitPath !== undefined) {
    const path = resolve(input.currentWorkingDirectory, input.explicitPath);

    if (await isFile(path)) {
      return {
        ok: true,
        path,
        source: input.explicitPathSource ?? "config"
      };
    }

    return {
      ok: false,
      reason: "contract-not-found",
      attemptedPath: path,
      message: `Could not find repository contract at ${path}`,
      nextSteps: ["Run board init to create .board/repository.yaml."]
    };
  }

  if (!input.repositoryRoot.ok) {
    return {
      ok: false,
      reason: "repository-not-found",
      message: input.repositoryRoot.message,
      nextSteps: ["Run board init from the repository root."]
    };
  }

  const path = join(input.repositoryRoot.root, defaultContractRelativePath);

  if (await isFile(path)) {
    return {
      ok: true,
      path,
      source: "repository-default",
      repositoryRoot: input.repositoryRoot.root
    };
  }

  return {
    ok: false,
    reason: "contract-not-found",
    attemptedPath: path,
    repositoryRoot: input.repositoryRoot.root,
    message: `Could not find repository contract at ${path}`,
    nextSteps: ["Run board init to create .board/repository.yaml."]
  };
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
