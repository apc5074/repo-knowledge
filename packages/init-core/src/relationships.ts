import type { ExternalSystem, RelatedRepository } from "@repo-knowledge/repository-contract";
import type { ScannerFact } from "@repo-knowledge/scanner-core";

import { stableId } from "./applications.js";
import { scannerFactEvidence } from "./evidence.js";
import type { InitReviewItem } from "./result.js";

export type RelationshipMappingResult = {
  readonly relatedRepositories: readonly RelatedRepository[];
  readonly externalSystems: readonly ExternalSystem[];
  readonly reviewItems: readonly InitReviewItem[];
  readonly inferredFields: readonly string[];
};

type FactRecord = Record<string, unknown>;

export function mapScannerFactsToRelationships(
  facts: readonly ScannerFact[]
): RelationshipMappingResult {
  const relatedRepositories = mapRelatedRepositories(facts);
  const externalSystems = mapExternalSystems(facts);
  const reviewItems = workspaceReviewItems(facts);

  return {
    relatedRepositories,
    externalSystems,
    reviewItems,
    inferredFields: [
      ...(relatedRepositories.length > 0 ? ["related_repositories"] : []),
      ...(externalSystems.length > 0 ? ["external_systems"] : [])
    ]
  };
}

function mapRelatedRepositories(facts: readonly ScannerFact[]): readonly RelatedRepository[] {
  const repositories = new Map<string, RelatedRepository>();

  for (const fact of facts) {
    const value = fact.value as FactRecord;
    const repositoryUrl = stringValue(value.repository_url) ?? stringValue(value.repositoryUrl);
    const repositorySlug =
      stringValue(value.repository_slug) ??
      stringValue(value.repositorySlug) ??
      slugFromGitHubUrl(repositoryUrl);

    if (!repositoryUrl && !repositorySlug) {
      continue;
    }

    const name =
      stringValue(value.name) ??
      repositorySlug?.split("/").at(-1) ??
      repositoryUrl
        ?.split("/")
        .at(-1)
        ?.replace(/\.git$/, "");

    if (!name) {
      continue;
    }

    const key = repositorySlug ?? repositoryUrl ?? name;
    repositories.set(key, {
      name,
      provider: providerFor(repositoryUrl, repositorySlug),
      ...(repositoryUrl ? { repository_url: repositoryUrl } : {}),
      ...(repositorySlug ? { repository_slug: repositorySlug } : {}),
      relationship: relationshipFor(value),
      direction: directionFor(value),
      notes:
        stringValue(value.notes) ??
        `Explicit repository relationship detected from ${fact.detector}.`,
      evidence: scannerFactEvidence(fact)
    });
  }

  return [...repositories.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function mapExternalSystems(facts: readonly ScannerFact[]): readonly ExternalSystem[] {
  const systems = new Map<string, ExternalSystem>();

  for (const fact of facts.filter(
    (candidate) => candidate.kind === "environment.variable_detected"
  )) {
    const value = fact.value as FactRecord;
    const name = stringValue(value.name);

    if (!name || !isExternalApiVariable(name)) {
      continue;
    }

    const systemName = externalNameFromVariable(name);
    const id = stableId(systemName);
    systems.set(id, {
      id,
      name: systemName,
      type: externalTypeFor(name),
      relationship: "consumes_api",
      direction: "outbound",
      description: `${name} indicates an external system endpoint used by the repository.`,
      evidence: scannerFactEvidence(fact)
    });
  }

  return [...systems.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function workspaceReviewItems(facts: readonly ScannerFact[]): readonly InitReviewItem[] {
  return facts
    .filter((fact) => fact.kind === "application.detected")
    .flatMap((fact) => {
      const value = fact.value as FactRecord;
      const workspaces = stringArray(value.workspaces);

      if (workspaces.length === 0) {
        return [];
      }

      return [
        {
          id: `relationships-${stableId(stringValue(value.path) ?? "workspace")}-workspace-review`,
          kind: "confirmation-required" as const,
          title: "Workspace relationship needs review",
          summary:
            "Workspace package relationships were detected but were not converted into related repositories because they are local package boundaries.",
          evidence: fact.evidence.map((evidence) => evidence.source_path)
        }
      ];
    });
}

function isExternalApiVariable(name: string): boolean {
  if (!/(^|_)(API|ENDPOINT|BASE_URL|WEBHOOK|HOST|URL)$/.test(name)) {
    return false;
  }

  return !/(DATABASE|POSTGRES|REDIS|CACHE|LOCALHOST|PORT|PUBLIC_URL|NODE_ENV)/.test(name);
}

function externalNameFromVariable(name: string): string {
  return name
    .replace(/_(API_URL|API|ENDPOINT|BASE_URL|WEBHOOK|HOST|URL)$/g, "")
    .replace(/^API_/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0] ?? ""}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function externalTypeFor(name: string): ExternalSystem["type"] {
  if (/ANALYTICS|SEGMENT|POSTHOG|AMPLITUDE|MIXPANEL/.test(name)) {
    return "analytics";
  }

  if (/PAYMENT|STRIPE|BILLING/.test(name)) {
    return "payment_provider";
  }

  if (/AUTH|IDENTITY|OAUTH|OIDC/.test(name)) {
    return "identity_provider";
  }

  return "http_api";
}

function relationshipFor(value: FactRecord): RelatedRepository["relationship"] {
  const relationship = stringValue(value.relationship);
  const allowed = [
    "consumes_api",
    "provides_api",
    "publishes_event",
    "consumes_event",
    "shared_package",
    "deploys_with",
    "unknown"
  ] as const;

  return allowed.find((candidate) => candidate === relationship) ?? "unknown";
}

function directionFor(value: FactRecord): RelatedRepository["direction"] {
  const direction = stringValue(value.direction);
  const allowed = ["inbound", "outbound", "bidirectional", "unknown"] as const;

  return allowed.find((candidate) => candidate === direction) ?? "unknown";
}

function providerFor(
  repositoryUrl: string | undefined,
  repositorySlug: string | undefined
): RelatedRepository["provider"] {
  if (repositoryUrl?.includes("github.com") || /^[^/]+\/[^/]+$/.test(repositorySlug ?? "")) {
    return "github";
  }

  if (repositoryUrl?.includes("gitlab.com")) {
    return "gitlab";
  }

  if (repositoryUrl?.includes("bitbucket.org")) {
    return "bitbucket";
  }

  return "unknown";
}

function slugFromGitHubUrl(url: string | undefined): string | undefined {
  const match = url?.match(/^https:\/\/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/);
  return match?.[1];
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean).sort() : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
