import type {
  GeneratedPath,
  SensitivePath,
  SourceOfTruthPath,
  UnsafePath
} from "@repo-knowledge/repository-contract";
import type { ScannerFact } from "@repo-knowledge/scanner-core";

import { stableId } from "./applications.js";
import { scannerFactEvidence } from "./evidence.js";
import { isSecretLikeName } from "./environment.js";
import type { InitReviewItem } from "./result.js";

export type PathRulesMappingResult = {
  readonly generatedFiles: readonly GeneratedPath[];
  readonly sensitivePaths: readonly SensitivePath[];
  readonly unsafePaths: readonly UnsafePath[];
  readonly sourceOfTruthPaths: readonly SourceOfTruthPath[];
  readonly reviewItems: readonly InitReviewItem[];
  readonly inferredFields: readonly string[];
};

type FactRecord = Record<string, unknown>;

export function mapScannerFactsToPathRules(facts: readonly ScannerFact[]): PathRulesMappingResult {
  const reviewItems: InitReviewItem[] = [];
  const generatedFiles = mapGeneratedFiles(facts, reviewItems);
  const sensitivePaths = mapSensitivePaths(facts);
  const unsafePaths = mapUnsafePaths(generatedFiles);

  return {
    generatedFiles,
    sensitivePaths,
    unsafePaths,
    sourceOfTruthPaths: [],
    reviewItems,
    inferredFields: [
      ...(generatedFiles.length > 0 ? ["generated_files"] : []),
      ...(sensitivePaths.length > 0 ? ["sensitive_paths"] : []),
      ...(unsafePaths.length > 0 ? ["unsafe_paths"] : [])
    ]
  };
}

function mapGeneratedFiles(
  facts: readonly ScannerFact[],
  reviewItems: InitReviewItem[]
): readonly GeneratedPath[] {
  const byPattern = new Map<string, GeneratedPath>();

  for (const fact of facts.filter((candidate) => candidate.kind === "generated.path_detected")) {
    const value = fact.value as FactRecord;
    const path = stringValue(value.path);

    if (!path || !isSafeRelativePath(path)) {
      continue;
    }

    const reason = stringValue(value.reason);
    const regenerationCommand = stringValue(value.regenerationCommand);
    const pattern = pathPattern(path, reason);
    const existing = byPattern.get(pattern);
    const evidence = [...(existing?.evidence ?? []), ...scannerFactEvidence(fact)];
    const generatedPath: GeneratedPath = {
      pattern,
      description: generatedDescription(value),
      evidence
    };

    if (regenerationCommand) {
      generatedPath.generated_by = {
        id: stableId(`generate-${path}`),
        command: regenerationCommand,
        evidence: scannerFactEvidence(fact)
      };
    } else if (value.managed !== true) {
      reviewItems.push({
        id: `generated-${stableId(path)}-missing-regeneration-command`,
        kind: "confirmation-required",
        title: "Generated path has no regeneration command",
        summary: `${path} appears generated, but the scanner did not find a command that recreates it.`,
        evidence: fact.evidence.map((evidenceItem) => evidenceItem.source_path)
      });
    }

    byPattern.set(pattern, generatedPath);
  }

  return [...byPattern.values()].sort((left, right) => left.pattern.localeCompare(right.pattern));
}

function mapSensitivePaths(facts: readonly ScannerFact[]): readonly SensitivePath[] {
  const paths = new Map<string, SensitivePath>();

  for (const fact of facts.filter(
    (candidate) => candidate.kind === "environment.variable_detected"
  )) {
    const value = fact.value as FactRecord;
    const name = stringValue(value.name);
    const hasSecretSignal = name ? Boolean(value.secret) || isSecretLikeName(name) : false;

    for (const evidence of fact.evidence) {
      const sourcePath = evidence.source_path;

      if (!sourcePath || !isEnvExamplePath(sourcePath) || !hasSecretSignal) {
        continue;
      }

      const pattern = envPatternFor(sourcePath);
      const existing = paths.get(pattern);
      paths.set(pattern, {
        pattern,
        risk: "May contain local credentials or tokens.",
        handling:
          "Do not store concrete local values in the repository contract or generated output.",
        evidence: [...(existing?.evidence ?? []), ...scannerFactEvidence(fact)]
      });
    }
  }

  return [...paths.values()].sort((left, right) => left.pattern.localeCompare(right.pattern));
}

function mapUnsafePaths(generatedFiles: readonly GeneratedPath[]): readonly UnsafePath[] {
  return generatedFiles
    .filter((path) => path.generated_by !== undefined || path.pattern.includes("*"))
    .filter((path) => !isLockfilePattern(path.pattern))
    .map((path) => ({
      pattern: path.pattern,
      reason: "Generated output should not be edited directly.",
      edit_instead: path.generated_by
        ? `Edit source inputs and run ${path.generated_by.command}.`
        : "Edit the source inputs that generate this path.",
      evidence: path.evidence
    }))
    .sort((left, right) => left.pattern.localeCompare(right.pattern));
}

function generatedDescription(value: FactRecord): string {
  const generator = stringValue(value.generator);
  const reason = stringValue(value.reason);

  if (reason === "lockfile") {
    return "Managed lockfile detected by the scanner.";
  }

  return generator
    ? `Generated path produced by ${generator}.`
    : "Generated or managed path detected by the scanner.";
}

function pathPattern(path: string, reason: string | undefined): string {
  return reason === "generated directory" ? `${path}/**` : path;
}

function envPatternFor(path: string): string {
  const lastSlash = path.lastIndexOf("/");

  if (lastSlash === -1) {
    return ".env*";
  }

  return `${path.slice(0, lastSlash)}/.env*`;
}

function isEnvExamplePath(path: string): boolean {
  const name = path.split("/").at(-1) ?? path;
  return [".env.example", ".env.sample", ".env.template", "env.example"].includes(name);
}

function isLockfilePattern(pattern: string): boolean {
  return /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|poetry\.lock|uv\.lock)$/.test(
    pattern
  );
}

function isSafeRelativePath(path: string): boolean {
  return path.trim() === path && path.length > 0 && !path.startsWith("/") && !path.includes("\0");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
