import type { RepositoryContract, RepositorySection } from "./types.js";
import {
  formatDetailedZodIssues,
  formatZodIssues,
  type DetailedValidationIssue,
  type ValidationIssue
} from "./errors.js";
import { repositoryContractSchema, repositorySectionSchema } from "./schema.js";

export type ValidationResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly issues: readonly [];
    }
  | {
      readonly ok: false;
      readonly issues: readonly ValidationIssue[];
    };

export type DetailedValidationResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly issues: readonly [];
    }
  | {
      readonly ok: false;
      readonly issues: readonly DetailedValidationIssue[];
    };

export function validateRepositorySection(input: unknown): ValidationResult<RepositorySection> {
  const result = repositorySectionSchema.safeParse(input);

  if (result.success) {
    return {
      ok: true,
      data: result.data,
      issues: []
    };
  }

  return {
    ok: false,
    issues: formatZodIssues(result.error)
  };
}

export function validateRepositoryContract(input: unknown): ValidationResult<RepositoryContract> {
  const result = repositoryContractSchema.safeParse(input);

  if (result.success) {
    return {
      ok: true,
      data: result.data,
      issues: []
    };
  }

  return {
    ok: false,
    issues: formatZodIssues(result.error)
  };
}

export function validateRepositorySectionDetailed(
  input: unknown
): DetailedValidationResult<RepositorySection> {
  const result = repositorySectionSchema.safeParse(input);

  if (result.success) {
    return {
      ok: true,
      data: result.data,
      issues: []
    };
  }

  return {
    ok: false,
    issues: formatDetailedZodIssues(result.error, input)
  };
}

export function validateRepositoryContractDetailed(
  input: unknown
): DetailedValidationResult<RepositoryContract> {
  const result = repositoryContractSchema.safeParse(input);

  if (result.success) {
    return {
      ok: true,
      data: result.data,
      issues: []
    };
  }

  return {
    ok: false,
    issues: formatDetailedZodIssues(result.error, input)
  };
}
