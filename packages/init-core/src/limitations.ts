import type { KnownLimitation, Service, Setup } from "@repo-knowledge/repository-contract";
import type { ScannerFact } from "@repo-knowledge/scanner-core";

import { stableId } from "./applications.js";
import { scannerFactEvidence } from "./evidence.js";
import type { InitReviewItem } from "./result.js";

export type KnownLimitationsMappingInput = {
  readonly facts: readonly ScannerFact[];
  readonly services?: Readonly<Record<string, Service>>;
  readonly setup?: Setup;
};

export type KnownLimitationsMappingResult = {
  readonly knownLimitations: readonly KnownLimitation[];
  readonly reviewItems: readonly InitReviewItem[];
  readonly inferredFields: readonly string[];
};

type FactRecord = Record<string, unknown>;

export function mapScannerFactsToKnownLimitations(
  input: KnownLimitationsMappingInput
): KnownLimitationsMappingResult {
  const knownLimitations = [
    ...codeOnlyDependencyLimitations(input.facts),
    ...missingSeedCommandLimitations(input.facts, input.setup),
    ...missingHealthCheckLimitations(input.services ?? {})
  ];
  const stableLimitations = dedupeLimitations(knownLimitations);

  return {
    knownLimitations: stableLimitations,
    reviewItems: [],
    inferredFields: stableLimitations.length > 0 ? ["known_limitations"] : []
  };
}

function codeOnlyDependencyLimitations(facts: readonly ScannerFact[]): readonly KnownLimitation[] {
  return facts
    .filter((fact) => {
      if (
        fact.kind !== "database.dependency_detected" &&
        fact.kind !== "cache.dependency_detected"
      ) {
        return false;
      }

      const value = fact.value as FactRecord;
      const sources = Array.isArray(value.sources) ? value.sources.map(String) : [];
      return value.service === undefined && !sources.some((source) => source.startsWith("compose"));
    })
    .map((fact) => {
      const value = fact.value as FactRecord;
      const name = stringValue(value.name) ?? "external-service";
      return {
        id: `${stableId(name)}-local-service-not-defined`,
        summary: `${displayName(name)} is referenced but no local service definition was found.`,
        impact:
          "Local setup may require an external service, a manually started dependency, or a Compose service added later.",
        workaround:
          "Confirm the intended local dependency path before relying on generated setup commands.",
        status: "unverified" as const,
        evidence: scannerFactEvidence(fact)
      };
    });
}

function missingSeedCommandLimitations(
  facts: readonly ScannerFact[],
  setup: Setup | undefined
): readonly KnownLimitation[] {
  if (setup?.seed !== undefined) {
    return [];
  }

  return facts
    .filter((fact) => fact.kind === "seed.directory_detected" && fact.confidence !== "low")
    .map((fact) => ({
      id: "seed-data-command-not-detected",
      summary: "Seed data was detected but no seed command was found.",
      impact:
        "A new local database may need manual data loading before feature work can be verified.",
      workaround: "Confirm the seed workflow and add it to the repository contract setup section.",
      status: "unverified" as const,
      evidence: scannerFactEvidence(fact)
    }));
}

function missingHealthCheckLimitations(
  services: Readonly<Record<string, Service>>
): readonly KnownLimitation[] {
  return Object.values(services)
    .filter((service) => service.required !== false && service.health_check === undefined)
    .map((service) => ({
      id: `${service.id}-health-check-not-detected`,
      summary: `${service.name ?? service.id} has no detected health check.`,
      impact:
        "Automated bootstrap and verification may need manual readiness checks for this service.",
      workaround:
        "Confirm a health-check command or Compose healthcheck before automating service readiness.",
      applies_to: [service.id],
      status: "unverified" as const,
      evidence: service.evidence ?? []
    }));
}

function dedupeLimitations(limitations: readonly KnownLimitation[]): readonly KnownLimitation[] {
  const byId = new Map<string, KnownLimitation>();

  for (const limitation of limitations) {
    const existing = byId.get(limitation.id);

    byId.set(limitation.id, {
      ...limitation,
      evidence: [...(existing?.evidence ?? []), ...(limitation.evidence ?? [])]
    });
  }

  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function displayName(name: string): string {
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
