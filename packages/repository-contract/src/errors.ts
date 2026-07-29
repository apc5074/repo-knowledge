import type { z } from "zod";

export type ValidationIssue = {
  readonly path: string;
  readonly message: string;
};

export type ValidationSeverity = "error" | "warning";

export type DetailedValidationIssue = ValidationIssue & {
  readonly code: string;
  readonly severity: ValidationSeverity;
  readonly expected?: string;
  readonly actual?: string;
  readonly suggestion?: string;
};

export type ValidationIssueJson = {
  readonly issues: readonly DetailedValidationIssue[];
};

function formatPath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? "<root>" : path.join(".");
}

function pathLooksSensitive(path: string): boolean {
  return /(^|\.)?(secret|password|token|api_key|key|example_value|default_for_local)$/i.test(path);
}

function formatSafeActualValue(issue: z.core.$ZodIssue, path: string): string | undefined {
  const issueWithInput = issue as z.core.$ZodIssue & { readonly input?: unknown };

  if (!("input" in issueWithInput)) {
    return undefined;
  }

  if (pathLooksSensitive(path)) {
    return "[redacted]";
  }

  const input = issueWithInput.input;

  if (input === undefined) {
    return "undefined";
  }

  if (typeof input === "string") {
    return input.length > 80 ? `${input.slice(0, 77)}...` : input;
  }

  if (typeof input === "number" || typeof input === "boolean" || input === null) {
    return String(input);
  }

  return Array.isArray(input) ? "[array]" : "[object]";
}

function getPathValue(input: unknown, path: readonly PropertyKey[]): unknown {
  let current = input;

  for (const segment of path) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }

    current = (current as Record<PropertyKey, unknown>)[segment];
  }

  return current;
}

function formatSafeValue(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (pathLooksSensitive(path)) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }

  return Array.isArray(value) ? "[array]" : "[object]";
}

function expectedFromIssue(issue: z.core.$ZodIssue): string | undefined {
  if ("values" in issue && Array.isArray(issue.values)) {
    return issue.values.map((value) => JSON.stringify(value)).join(" | ");
  }

  if ("expected" in issue && typeof issue.expected === "string") {
    return issue.expected;
  }

  return undefined;
}

function suggestionFromIssue(issue: z.core.$ZodIssue, path: string): string | undefined {
  if (issue.code === "invalid_value" && expectedFromIssue(issue) !== undefined) {
    return `Use one of the allowed values for ${path}.`;
  }

  if (issue.code === "unrecognized_keys") {
    return "Move custom data under metadata or remove the unsupported field.";
  }

  if (issue.message.includes("Unknown application or service dependency")) {
    return "Add the referenced id under applications or services, or remove the dependency.";
  }

  if (issue.message.includes("Unknown environment variable")) {
    return "Declare the variable under environment or remove the reference.";
  }

  if (issue.message.includes("secret") || pathLooksSensitive(path)) {
    return "Store only the variable name or a safe placeholder, never a real secret value.";
  }

  if (issue.message.includes("review")) {
    return "Mark generated or uncertain agent output with review metadata before approval.";
  }

  return undefined;
}

export function formatZodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message
  }));
}

export function formatDetailedZodIssues(
  error: z.ZodError,
  input?: unknown
): DetailedValidationIssue[] {
  return error.issues.map((issue) => {
    const path = formatPath(issue.path);
    const actual =
      formatSafeActualValue(issue, path) ?? formatSafeValue(getPathValue(input, issue.path), path);

    return {
      path,
      message: issue.message,
      code: issue.code,
      severity: "error",
      expected: expectedFromIssue(issue),
      actual,
      suggestion: suggestionFromIssue(issue, path)
    };
  });
}

export function formatValidationIssuesForHuman(issues: readonly DetailedValidationIssue[]): string {
  if (issues.length === 0) {
    return "No validation issues.";
  }

  return issues
    .map((issue) => {
      const details = [
        issue.expected === undefined ? undefined : `expected ${issue.expected}`,
        issue.actual === undefined ? undefined : `actual ${issue.actual}`,
        issue.suggestion
      ]
        .filter((value) => value !== undefined)
        .join("; ");

      return details.length === 0
        ? `${issue.severity.toUpperCase()} ${issue.path}: ${issue.message}`
        : `${issue.severity.toUpperCase()} ${issue.path}: ${issue.message} (${details})`;
    })
    .join("\n");
}

export function formatValidationIssuesForJson(
  issues: readonly DetailedValidationIssue[]
): ValidationIssueJson {
  return { issues };
}
