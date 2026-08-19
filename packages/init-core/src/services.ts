import type { Service } from "@repo-knowledge/repository-contract";
import type { ScannerFact } from "@repo-knowledge/scanner-core";

import { stableId } from "./applications.js";
import { scannerFactEvidence } from "./evidence.js";
import type { InitReviewItem } from "./result.js";

export type ServiceMappingResult = {
  readonly services: Readonly<Record<string, Service>>;
  readonly reviewItems: readonly InitReviewItem[];
  readonly inferredFields: readonly string[];
};

type FactRecord = Record<string, unknown>;

export function mapScannerFactsToServices(facts: readonly ScannerFact[]): ServiceMappingResult {
  const services: Record<string, Service> = {};
  const reviewItems: InitReviewItem[] = [];

  for (const fact of composeServiceFacts(facts)) {
    const value = fact.value as FactRecord;
    const name = stringValue(value.name);

    if (!name) {
      continue;
    }

    const type = serviceType(value);
    const id = uniqueId(
      stableId(type === "container" || type === "unknown" ? `service-${name}` : name),
      services
    );
    services[id] = {
      id,
      name,
      type,
      compose_service: name,
      image: stringValue(value.image),
      ports: [...parsePorts(value.ports)],
      required: true,
      environment: [...stringArray(value.environment)],
      volumes: [...stringArray(value.volumes)],
      evidence: [...scannerFactEvidence(fact)]
    };
  }

  for (const fact of codeOnlyDependencyFacts(facts)) {
    const value = fact.value as FactRecord;
    const dependency = stringValue(value.name) ?? "dependency";

    reviewItems.push({
      id: `service-${stableId(dependency)}-code-only`,
      kind: "confirmation-required",
      title: "Local service definition not found",
      summary: `${dependency} was detected from code or manifests, but no Compose service was found. It was not converted into a contract service.`,
      evidence: fact.evidence.map((evidence) => evidence.source_path)
    });
  }

  return {
    services,
    reviewItems,
    inferredFields: Object.keys(services).length > 0 ? ["services"] : []
  };
}

function composeServiceFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  return facts.filter((fact) => fact.kind === "compose.service_detected");
}

function codeOnlyDependencyFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  return facts.filter((fact) => {
    if (fact.kind !== "database.dependency_detected" && fact.kind !== "cache.dependency_detected") {
      return false;
    }

    const value = fact.value as FactRecord;
    const sources = Array.isArray(value.sources) ? value.sources.map(String) : [];
    return value.service === undefined && !sources.some((source) => source.startsWith("compose"));
  });
}

function serviceType(value: FactRecord): Service["type"] {
  const text = `${stringValue(value.name) ?? ""} ${stringValue(value.image) ?? ""}`.toLowerCase();

  if (/postgres|postgis/.test(text)) {
    return "postgresql";
  }

  if (/redis/.test(text)) {
    return "redis";
  }

  if (stringArray(value.ports).length > 0) {
    return "container";
  }

  return "unknown";
}

function parsePorts(value: unknown): readonly number[] {
  return [
    ...new Set(
      stringArray(value)
        .map((entry) =>
          [...entry.matchAll(/\b([1-9][0-9]{1,4})\b/g)].map((match) => Number(match[1]))
        )
        .map((ports) => ports.at(-1))
        .filter((port): port is number => port !== undefined && port > 0 && port <= 65535)
    )
  ].sort((left, right) => left - right);
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(String).filter(Boolean).sort();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
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
