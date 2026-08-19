import type { RepositoryContract } from "@repo-knowledge/repository-contract";

import type { InitReviewItem } from "./result.js";

export type ContractMergeResult = {
  readonly contract: RepositoryContract;
  readonly reviewItems: readonly InitReviewItem[];
  readonly inferredFields: readonly string[];
};

export function mergeRepositoryContracts(input: {
  readonly existing: RepositoryContract;
  readonly generated: RepositoryContract;
}): ContractMergeResult {
  const reviewItems: InitReviewItem[] = [];
  const contract: RepositoryContract = {
    ...input.generated,
    repository: {
      ...input.generated.repository,
      ...preservedRepositoryFields(input.existing.repository)
    },
    metadata: input.existing.metadata ?? input.generated.metadata,
    maintenance: input.existing.maintenance ?? input.generated.maintenance,
    applications: mergeRecordSection(
      "applications",
      input.existing.applications ?? {},
      input.generated.applications ?? {},
      reviewItems
    ),
    services: mergeRecordSection(
      "services",
      input.existing.services ?? {},
      input.generated.services ?? {},
      reviewItems
    ),
    environment: mergeRecordSection(
      "environment",
      input.existing.environment ?? {},
      input.generated.environment ?? {},
      reviewItems
    ),
    setup: mergeObjectSection(
      "setup",
      input.existing.setup ?? {},
      input.generated.setup ?? {},
      reviewItems
    ),
    verification:
      input.existing.verification !== undefined
        ? input.existing.verification
        : input.generated.verification,
    generated_files: mergeArraySection(
      "generated_files",
      input.existing.generated_files ?? [],
      input.generated.generated_files ?? [],
      "pattern",
      reviewItems
    ),
    sensitive_paths: mergeArraySection(
      "sensitive_paths",
      input.existing.sensitive_paths ?? [],
      input.generated.sensitive_paths ?? [],
      "pattern",
      reviewItems
    ),
    unsafe_paths: mergeArraySection(
      "unsafe_paths",
      input.existing.unsafe_paths ?? [],
      input.generated.unsafe_paths ?? [],
      "pattern",
      reviewItems
    ),
    source_of_truth_paths: mergeArraySection(
      "source_of_truth_paths",
      input.existing.source_of_truth_paths ?? [],
      input.generated.source_of_truth_paths ?? [],
      "pattern",
      reviewItems
    ),
    related_repositories: mergeArraySection(
      "related_repositories",
      input.existing.related_repositories ?? [],
      input.generated.related_repositories ?? [],
      "name",
      reviewItems
    ),
    external_systems: mergeArraySection(
      "external_systems",
      input.existing.external_systems ?? [],
      input.generated.external_systems ?? [],
      "id",
      reviewItems
    ),
    known_limitations: mergeArraySection(
      "known_limitations",
      input.existing.known_limitations ?? [],
      input.generated.known_limitations ?? [],
      "id",
      reviewItems
    )
  };

  return {
    contract,
    reviewItems,
    inferredFields: reviewItems.length > 0 ? ["existing_contract_merge"] : []
  };
}

function preservedRepositoryFields(
  repository: RepositoryContract["repository"]
): Partial<RepositoryContract["repository"]> {
  return {
    purpose: repository.purpose,
    owners: repository.owners,
    description: repository.description,
    tags: repository.tags,
    metadata: repository.metadata
  };
}

function mergeRecordSection<T>(
  section: string,
  existing: Readonly<Record<string, T>>,
  generated: Readonly<Record<string, T>>,
  reviewItems: InitReviewItem[]
): Record<string, T> {
  const merged: Record<string, T> = { ...generated };

  for (const [key, existingValue] of Object.entries(existing)) {
    if (merged[key] !== undefined && !sameJson(merged[key], existingValue)) {
      reviewItems.push(conflictReviewItem(section, key));
    }

    merged[key] = existingValue;
  }

  return sortRecord(merged);
}

function mergeObjectSection<T extends Record<string, unknown>>(
  section: string,
  existing: T,
  generated: T,
  reviewItems: InitReviewItem[]
): T {
  const merged: Record<string, unknown> = { ...generated };

  for (const [key, existingValue] of Object.entries(existing)) {
    if (merged[key] !== undefined && !sameJson(merged[key], existingValue)) {
      reviewItems.push(conflictReviewItem(section, key));
    }

    merged[key] = existingValue;
  }

  return sortRecord(merged) as T;
}

function mergeArraySection<T extends Record<string, unknown>>(
  section: string,
  existing: readonly T[],
  generated: readonly T[],
  identityKey: keyof T,
  reviewItems: InitReviewItem[]
): T[] {
  const byIdentity = new Map<string, T>();

  for (const item of generated) {
    const identity = stringIdentity(item[identityKey]);
    if (identity) {
      byIdentity.set(identity, item);
    }
  }

  for (const item of existing) {
    const identity = stringIdentity(item[identityKey]);
    if (!identity) {
      continue;
    }

    const generatedItem = byIdentity.get(identity);
    if (generatedItem !== undefined && !sameJson(generatedItem, item)) {
      reviewItems.push(conflictReviewItem(section, identity));
    }

    byIdentity.set(identity, item);
  }

  return [...byIdentity.values()].sort((left, right) =>
    String(left[identityKey]).localeCompare(String(right[identityKey]))
  );
}

function conflictReviewItem(section: string, key: string): InitReviewItem {
  return {
    id: `merge-${section}-${key}`.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"),
    kind: "conflict",
    title: "Existing contract value preserved",
    summary: `Existing ${section}.${key} differs from the generated value. The existing contract value was preserved for maintainer review.`
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sortRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );
}

function stringIdentity(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
