import { access } from "node:fs/promises";
import { join } from "node:path";

import {
  parseRepositoryContractFile,
  RepositoryContractParseError,
  type RepositoryContract,
  type ValidationIssue
} from "@repo-knowledge/repository-contract";

export const defaultRepositoryContractPath = ".board/repository.yaml";

export type RuntimeContractLoadResult =
  | {
      readonly ok: true;
      readonly path: string;
      readonly contract: RepositoryContract;
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly path: string;
      readonly reason: "contract-not-found" | "contract-invalid" | "read-error";
      readonly message: string;
      readonly issues: readonly ValidationIssue[];
      readonly warnings: readonly string[];
      readonly nextSteps: readonly string[];
    };

export type LoadRuntimeContractInput = {
  readonly repositoryRoot: string;
  readonly contractPath?: string;
};

export async function loadRuntimeContract(
  input: LoadRuntimeContractInput
): Promise<RuntimeContractLoadResult> {
  const path = resolveRuntimeContractPath(input);

  try {
    await access(path);
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        ok: false,
        path,
        reason: "contract-not-found",
        message: `No Board repository contract found at ${path}.`,
        issues: [],
        warnings: [],
        nextSteps: ["Run board init to create .board/repository.yaml before using board start."]
      };
    }

    return readErrorResult(path, error);
  }

  try {
    return {
      ok: true,
      path,
      contract: await parseRepositoryContractFile(path),
      warnings: []
    };
  } catch (error) {
    if (error instanceof RepositoryContractParseError) {
      return {
        ok: false,
        path,
        reason: "contract-invalid",
        message: error.message,
        issues: error.issues,
        warnings: [],
        nextSteps: ["Fix the contract issues above, then run board contract validate again."]
      };
    }

    return readErrorResult(path, error);
  }
}

export function resolveRuntimeContractPath(input: LoadRuntimeContractInput): string {
  return input.contractPath ?? join(input.repositoryRoot, defaultRepositoryContractPath);
}

function readErrorResult(path: string, error: unknown): RuntimeContractLoadResult {
  return {
    ok: false,
    path,
    reason: "read-error",
    message: error instanceof Error ? error.message : String(error),
    issues: [],
    warnings: [],
    nextSteps: ["Check file permissions, then run board contract validate again."]
  };
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
