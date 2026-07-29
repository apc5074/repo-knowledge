import {
  parseRepositoryContractFile,
  RepositoryContractParseError,
  type RepositoryContract
} from "@repo-knowledge/repository-contract";

import type { ContractPathResult } from "./contract-path.js";
import { exitCodes, type ExitCode } from "../errors/exit-codes.js";

export type ContractLoadResult =
  | {
      readonly ok: true;
      readonly path: string;
      readonly contract: RepositoryContract;
    }
  | {
      readonly ok: false;
      readonly path?: string;
      readonly reason:
        "repository-not-found" | "contract-not-found" | "contract-invalid" | "read-error";
      readonly exitCode: ExitCode;
      readonly message: string;
      readonly issues: readonly ContractLoadIssue[];
      readonly nextSteps: readonly string[];
    };

export type ContractLoadIssue = {
  readonly path: string;
  readonly message: string;
};

export async function loadRepositoryContract(
  pathResult: ContractPathResult
): Promise<ContractLoadResult> {
  if (!pathResult.ok) {
    return {
      ok: false,
      path: pathResult.attemptedPath,
      reason: pathResult.reason,
      exitCode:
        pathResult.reason === "repository-not-found"
          ? exitCodes.repositoryNotFound
          : exitCodes.contractNotFound,
      message: pathResult.message,
      issues: [],
      nextSteps: pathResult.nextSteps
    };
  }

  try {
    return {
      ok: true,
      path: pathResult.path,
      contract: await parseRepositoryContractFile(pathResult.path)
    };
  } catch (error) {
    if (error instanceof RepositoryContractParseError) {
      return {
        ok: false,
        path: pathResult.path,
        reason: "contract-invalid",
        exitCode: exitCodes.contractInvalid,
        message: error.message,
        issues: error.issues,
        nextSteps: ["Fix the contract issues above, then run board contract validate again."]
      };
    }

    return {
      ok: false,
      path: pathResult.path,
      reason: "read-error",
      exitCode: exitCodes.permissionOrAccess,
      message: error instanceof Error ? error.message : String(error),
      issues: [],
      nextSteps: ["Check file permissions, then run board contract validate again."]
    };
  }
}
