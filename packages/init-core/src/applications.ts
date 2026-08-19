import type { Application } from "@repo-knowledge/repository-contract";
import type { ScannerFact } from "@repo-knowledge/scanner-core";

import { scannerFactEvidence } from "./evidence.js";
import type { InitReviewItem } from "./result.js";

export type ApplicationMappingResult = {
  readonly applications: Readonly<Record<string, Application>>;
  readonly reviewItems: readonly InitReviewItem[];
  readonly inferredFields: readonly string[];
  readonly unconfirmedFields: readonly string[];
};

type FactRecord = Record<string, unknown>;

export function mapScannerFactsToApplications(
  facts: readonly ScannerFact[]
): ApplicationMappingResult {
  const applications: Record<string, Application> = {};
  const reviewItems: InitReviewItem[] = [];

  for (const fact of applicationCandidateFacts(facts)) {
    const value = fact.value as FactRecord;
    const path = stringValue(value.path);

    if (!path || path.startsWith("@")) {
      continue;
    }

    if (fact.confidence === "low") {
      reviewItems.push({
        id: `application-${stableId(path)}-low-confidence`,
        kind: "low-confidence",
        title: "Application candidate needs review",
        summary: `Scanner found a low-confidence application candidate at ${path}.`,
        evidence: fact.evidence.map((evidence) => evidence.source_path)
      });
      continue;
    }

    const type = applicationType(path, stringValue(value.kind), facts);
    const name = applicationName(path, type, value, facts);
    const id = uniqueId(stableId(path === "." ? type : name), applications);
    applications[id] = {
      id,
      name,
      type,
      working_directory: path,
      entrypoint: entrypointForPath(path, facts),
      start: commandForPath(path, facts, ["start"]),
      dev: commandForPath(path, facts, ["development"]),
      build: commandForPath(path, facts, ["build"]),
      ports: [...portsForPath(path, facts)],
      depends_on: [],
      environment: [],
      evidence: [...scannerFactEvidence(fact)]
    };
  }

  return {
    applications,
    reviewItems,
    inferredFields: Object.keys(applications).length > 0 ? ["applications"] : [],
    unconfirmedFields: reviewItems.map((item) => item.id)
  };
}

function applicationCandidateFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  const aggregatorFacts = facts.filter(
    (fact) => fact.kind === "application.detected" && fact.detector === "candidate-aggregator"
  );

  return aggregatorFacts.length > 0
    ? aggregatorFacts
    : facts.filter((fact) => fact.kind === "application.detected");
}

function entrypointForPath(path: string, facts: readonly ScannerFact[]): string | undefined {
  return facts
    .filter((fact) => fact.kind === "entrypoint.detected")
    .map((fact) => fact.value as FactRecord)
    .map((value) => stringValue(value.path))
    .filter((candidate): candidate is string => candidate !== undefined)
    .find((candidate) => candidate === path || candidate.startsWith(`${path}/`));
}

function commandForPath(
  path: string,
  facts: readonly ScannerFact[],
  categories: readonly string[]
): Application["start"] {
  const commandFact = facts.find((fact) => {
    if (fact.kind !== "command.detected" || fact.confidence === "low") {
      return false;
    }

    const value = fact.value as FactRecord;
    return value.cwd === path && categories.includes(String(value.category));
  });

  if (!commandFact) {
    return undefined;
  }

  const value = commandFact.value as FactRecord;
  const command = stringValue(value.command);

  if (!command) {
    return undefined;
  }

  return {
    id: stableId(`${path}-${String(value.category)}`),
    command,
    working_directory: path,
    evidence: [...scannerFactEvidence(commandFact)]
  };
}

function portsForPath(path: string, facts: readonly ScannerFact[]): readonly number[] {
  return [
    ...new Set(
      facts
        .filter((fact) => fact.kind === "command.detected")
        .map((fact) => fact.value as FactRecord)
        .filter((value) => value.cwd === path)
        .flatMap((value) => numbersInText(stringValue(value.command) ?? ""))
        .filter((port) => port > 0 && port <= 65535)
    )
  ].sort((left, right) => left - right);
}

function applicationName(
  path: string,
  type: Application["type"],
  candidate: FactRecord,
  facts: readonly ScannerFact[]
): string {
  const manifestName = facts
    .filter(
      (fact) =>
        fact.kind === "application.detected" &&
        (fact.detector === "javascript-manifest" || fact.detector === "python-manifest")
    )
    .map((fact) => fact.value as FactRecord)
    .find((value) => value.path === path)?.name;

  if (typeof manifestName === "string" && manifestName.trim().length > 0) {
    return manifestName.trim().replace(/^@[^/]+\//, "");
  }

  return stringValue(candidate.name) ?? (path === "." ? type : (path.split("/").at(-1) ?? type));
}

function applicationType(
  path: string,
  kind: string | undefined,
  facts: readonly ScannerFact[]
): Application["type"] {
  const pathFacts = facts.filter(
    (fact) => fact.detector !== "candidate-aggregator" && factAppliesToPath(fact, path)
  );
  const text = pathFacts
    .map((fact) => JSON.stringify(fact.value))
    .join(" ")
    .toLowerCase();

  if (pathFacts.some((fact) => fact.kind === "worker.detected") || /\bworker\b/.test(text)) {
    return "worker";
  }

  if (/\b(next|vite|react|frontend|browser)\b/.test(text)) {
    return "frontend";
  }

  if (
    pathFacts.some((fact) => fact.kind === "api.route_file_detected") ||
    /\b(express|fastify|nestjs|fastapi|flask|django)\b/.test(text)
  ) {
    return "api";
  }

  if (kind?.startsWith("api")) {
    return "api";
  }

  if (kind?.startsWith("frontend")) {
    return "frontend";
  }

  if (kind?.startsWith("worker")) {
    return "worker";
  }

  if (kind?.startsWith("cli")) {
    return "cli";
  }

  return "unknown";
}

function factAppliesToPath(fact: ScannerFact, path: string): boolean {
  const value = fact.value as FactRecord;
  const candidatePath = stringValue(value.path) ?? stringValue(value.cwd);

  if (!candidatePath) {
    return path === ".";
  }

  return candidatePath === path || candidatePath.startsWith(`${path}/`);
}

function numbersInText(text: string): readonly number[] {
  return [...text.matchAll(/\b([1-9][0-9]{1,4})\b/g)].map((match) => Number(match[1]));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function stableId(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return /^[a-z]/.test(slug) ? slug : `item-${slug || "unknown"}`;
}

function uniqueId(base: string, existing: Readonly<Record<string, unknown>>): string {
  if (existing[base] === undefined) {
    return base;
  }

  let index = 2;
  while (existing[`${base}-${index}`] !== undefined) {
    index += 1;
  }

  return `${base}-${index}`;
}
