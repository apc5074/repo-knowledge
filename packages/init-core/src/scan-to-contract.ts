import { basename } from "node:path";

import type { RepositorySection } from "@repo-knowledge/repository-contract";
import type { ScannerFact } from "@repo-knowledge/scanner-core";

import type { InitReviewItem } from "./result.js";

export type RepositorySectionMappingResult = {
  readonly repository: RepositorySection;
  readonly inferredFields: readonly string[];
  readonly unconfirmedFields: readonly string[];
  readonly reviewItems: readonly InitReviewItem[];
};

type FactRecord = Record<string, unknown>;

const supportedLanguages = new Set(["typescript", "javascript", "python", "go", "unknown"]);

export function mapScannerFactsToRepositorySection(input: {
  readonly repositoryRoot: string;
  readonly facts: readonly ScannerFact[];
}): RepositorySectionMappingResult {
  const languages = languageValues(input.facts);
  const primaryLanguage = primaryLanguageValue(input.facts, languages);
  const nameResult = repositoryName(input.repositoryRoot, input.facts);
  const typeResult = repositoryType(input.facts);
  const inferredFields = [
    "repository.name",
    "repository.type",
    "repository.primary_language",
    ...(languages.length > 0 ? ["repository.languages"] : [])
  ];
  const unconfirmedFields: string[] = [];
  const reviewItems: InitReviewItem[] = [...nameResult.reviewItems, ...typeResult.reviewItems];

  if (primaryLanguage === "unknown") {
    unconfirmedFields.push("repository.primary_language");
    reviewItems.push({
      id: "repository-primary-language-unconfirmed",
      kind: "missing-evidence",
      title: "Primary language needs review",
      summary: "The scanner did not find a strong primary language signal."
    });
  }

  if (typeResult.type === "unknown") {
    unconfirmedFields.push("repository.type");
  }

  return {
    repository: {
      name: nameResult.name,
      type: typeResult.type,
      primary_language: primaryLanguage,
      languages: [...languages],
      root: "."
    },
    inferredFields,
    unconfirmedFields,
    reviewItems
  };
}

function repositoryName(
  repositoryRoot: string,
  facts: readonly ScannerFact[]
): { readonly name: string; readonly reviewItems: readonly InitReviewItem[] } {
  const rootApplication = applicationFacts(facts)
    .filter(
      (fact) => fact.detector === "javascript-manifest" || fact.detector === "python-manifest"
    )
    .map((fact) => fact.value as FactRecord)
    .find((value) => value.path === "." && typeof value.name === "string");

  if (typeof rootApplication?.name === "string" && rootApplication.name.trim().length > 0) {
    return {
      name: normalizeRepositoryName(rootApplication.name),
      reviewItems: []
    };
  }

  return {
    name: normalizeRepositoryName(basename(repositoryRoot)),
    reviewItems: [
      {
        id: "repository-name-from-directory",
        kind: "confirmation-required",
        title: "Repository name came from directory name",
        summary: "No root package or project name was found, so the directory name was used."
      }
    ]
  };
}

function primaryLanguageValue(
  facts: readonly ScannerFact[],
  languages: readonly RepositorySection["primary_language"][]
): RepositorySection["primary_language"] {
  if (languages.includes("typescript")) {
    return "typescript";
  }

  const primary = languageFacts(facts)
    .filter((fact) => fact.confidence !== "low")
    .find((fact) => (fact.value as FactRecord).primary === true)?.value as FactRecord | undefined;
  const primaryLanguage = typeof primary?.language === "string" ? primary.language : undefined;

  if (primaryLanguage && supportedLanguages.has(primaryLanguage)) {
    return primaryLanguage as RepositorySection["primary_language"];
  }

  return languages[0] ?? "unknown";
}

function languageValues(
  facts: readonly ScannerFact[]
): readonly RepositorySection["primary_language"][] {
  const languages = languageFacts(facts)
    .filter((fact) => fact.confidence !== "low")
    .map((fact) => (fact.value as FactRecord).language)
    .filter((language): language is RepositorySection["primary_language"] => {
      return typeof language === "string" && supportedLanguages.has(language);
    });

  return [...new Set(languages)].sort();
}

function repositoryType(facts: readonly ScannerFact[]): {
  readonly type: RepositorySection["type"];
  readonly reviewItems: readonly InitReviewItem[];
} {
  const applications = applicationFacts(facts).map((fact) => fact.value as FactRecord);
  const manifestApplications = applicationFacts(facts)
    .filter(
      (fact) => fact.detector === "javascript-manifest" || fact.detector === "python-manifest"
    )
    .map((fact) => fact.value as FactRecord);
  const workspaceApplication = manifestApplications.find(
    (value) => value.path === "." && Array.isArray(value.workspaces) && value.workspaces.length > 0
  );
  const frameworkNames = new Set(
    facts
      .filter((fact) => fact.kind === "framework.detected")
      .map((fact) => (fact.value as FactRecord).name)
      .filter((name): name is string => typeof name === "string")
      .map((name) => name.toLowerCase())
  );

  if (workspaceApplication) {
    return {
      type: "monorepo",
      reviewItems: []
    };
  }

  if (manifestApplications.filter((value) => value.path !== ".").length > 1) {
    return {
      type: "monorepo",
      reviewItems: []
    };
  }

  if (applications.some((value) => String(value.kind ?? "").includes("cli"))) {
    return {
      type: "tooling",
      reviewItems: []
    };
  }

  if (
    frameworkNames.has("express") ||
    frameworkNames.has("fastapi") ||
    frameworkNames.has("flask") ||
    frameworkNames.has("django")
  ) {
    return {
      type: "service",
      reviewItems: []
    };
  }

  if (frameworkNames.has("react") || frameworkNames.has("vite") || frameworkNames.has("next.js")) {
    return {
      type: "application",
      reviewItems: []
    };
  }

  return {
    type: "unknown",
    reviewItems: [
      {
        id: "repository-type-unconfirmed",
        kind: "confirmation-required",
        title: "Repository type needs review",
        summary: "The scanner did not find enough evidence to choose a repository type."
      }
    ]
  };
}

function languageFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  return facts.filter((fact) => fact.kind === "language.detected");
}

function applicationFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  return facts.filter((fact) => fact.kind === "application.detected");
}

function normalizeRepositoryName(name: string): string {
  return name.trim().replace(/^@[^/]+\//, "");
}
