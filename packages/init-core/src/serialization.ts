import {
  parseRepositoryContract,
  serializeRepositoryContract,
  validateRepositoryContractDetailed,
  type RepositoryContract
} from "@repo-knowledge/repository-contract";

import type { InitValidationResult } from "./result.js";

export type InitSerializedContract = {
  readonly content: string;
  readonly contract: RepositoryContract;
  readonly validation: InitValidationResult;
};

export function serializeContractForInit(contract: RepositoryContract): InitSerializedContract {
  const content = serializeRepositoryContract(contract);
  const parsed = parseRepositoryContract(content);
  const validation = validateRepositoryContractDetailed(parsed);

  return {
    content,
    contract: validation.ok ? validation.data : parsed,
    validation: {
      ok: validation.ok,
      issues: validation.ok
        ? []
        : validation.issues.map((issue) => `${issue.path}: ${issue.message}`)
    }
  };
}
