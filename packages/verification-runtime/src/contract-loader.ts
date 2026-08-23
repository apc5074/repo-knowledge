import { access } from "node:fs/promises";
import { join } from "node:path";

import {
  parseRepositoryContractFile,
  RepositoryContractParseError,
  type RepositoryContract,
  type ValidationIssue
} from "../../repository-contract/src/index.js";

export const defaultVerificationContractPath = ".board/repository.yaml";

export type VerificationContractLoadResult =
  | {
      readonly ok: true;
      readonly path: string;
      readonly version: number;
      readonly contract: RepositoryContract;
      readonly verification: RepositoryContract["verification"];
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

export type LoadVerificationContractInput = {
  readonly repositoryRoot: string;
  readonly contractPath?: string;
};

export async function loadVerificationContract(
  input: LoadVerificationContractInput
): Promise<VerificationContractLoadResult> {
  const path = resolveVerificationContractPath(input);

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
        nextSteps: ["Run board init to create .board/repository.yaml before using board verify."]
      };
    }

    return readErrorResult(path, error);
  }

  try {
    const contract = await parseRepositoryContractFile(path);

    return {
      ok: true,
      path,
      version: contract.version,
      contract,
      verification: contract.verification ?? { default: [], rules: [] },
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

export function resolveVerificationContractPath(input: LoadVerificationContractInput): string {
  return input.contractPath ?? join(input.repositoryRoot, defaultVerificationContractPath);
}

function readErrorResult(path: string, error: unknown): VerificationContractLoadResult {
  const message = error instanceof Error ? error.message : String(error);

  return {
    ok: false,
    path,
    reason: "read-error",
    message,
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
