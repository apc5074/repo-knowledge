import { readFile } from "node:fs/promises";

import { parseDocument } from "yaml";

import { validateRepositoryContract } from "./validate.js";
import type { RepositoryContract } from "./types.js";
import type { ValidationIssue } from "./errors.js";
import { migrateRepositoryContractInput } from "./migrations.js";

export type RepositoryContractParseErrorKind = "yaml" | "validation";

export class RepositoryContractParseError extends Error {
  readonly kind: RepositoryContractParseErrorKind;
  readonly issues: readonly ValidationIssue[];

  constructor(
    kind: RepositoryContractParseErrorKind,
    message: string,
    issues: readonly ValidationIssue[] = []
  ) {
    super(message);
    this.name = "RepositoryContractParseError";
    this.kind = kind;
    this.issues = issues;
  }
}

export function parseRepositoryContractObject(input: unknown): RepositoryContract {
  const migratedInput = migrateRepositoryContractInput(input);
  const result = validateRepositoryContract(migratedInput);

  if (result.ok) {
    return result.data;
  }

  const message = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  throw new RepositoryContractParseError(
    "validation",
    `Invalid repository contract: ${message}`,
    result.issues
  );
}

export function parseRepositoryContract(yamlText: string): RepositoryContract {
  const document = parseDocument(yamlText, {
    prettyErrors: false,
    strict: true
  });

  if (document.errors.length > 0) {
    const message = document.errors
      .map((error) => {
        const linePosition = error.linePos?.[0];
        const location =
          linePosition === undefined ? "" : ` at ${linePosition.line}:${linePosition.col}`;

        return `${error.message}${location}`;
      })
      .join("; ");

    throw new RepositoryContractParseError("yaml", `Invalid repository contract YAML: ${message}`);
  }

  return parseRepositoryContractObject(document.toJSON());
}

export async function parseRepositoryContractFile(filePath: string): Promise<RepositoryContract> {
  const yamlText = await readFile(filePath, "utf8");

  return parseRepositoryContract(yamlText);
}
