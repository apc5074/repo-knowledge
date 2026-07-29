import { stringify } from "yaml";

import { parseRepositoryContractObject } from "./parse.js";
import type { RepositoryContract } from "./types.js";

const keyOrder = [
  "version",
  "repository",
  "metadata",
  "maintenance",
  "id",
  "name",
  "purpose",
  "value",
  "type",
  "primary_language",
  "languages",
  "root",
  "working_directory",
  "owners",
  "description",
  "tags",
  "applications",
  "services",
  "environment",
  "setup",
  "verification",
  "generated_files",
  "sensitive_paths",
  "unsafe_paths",
  "source_of_truth_paths",
  "related_repositories",
  "external_systems",
  "known_limitations",
  "kind",
  "command",
  "args",
  "shell",
  "timeout_seconds",
  "requires",
  "optional",
  "optional_reason",
  "depends_on",
  "ports",
  "compose_service",
  "image",
  "health_check",
  "required",
  "used_by",
  "secret",
  "default_for_local",
  "example_value",
  "source",
  "evidence",
  "pattern",
  "generated_by",
  "source_paths",
  "risk",
  "handling",
  "reason",
  "edit_instead",
  "governs",
  "provider",
  "repository_url",
  "repository_slug",
  "relationship",
  "direction",
  "endpoint",
  "summary",
  "impact",
  "applies_to",
  "workaround",
  "status",
  "last_verified",
  "metadata",
  "review_status",
  "review_required",
  "agent_run_id",
  "tool_call_id",
  "proposal_id",
  "approval_id",
  "notes"
] as const;

const keyRank = new Map<string, number>(keyOrder.map((key, index) => [key, index]));

function compareKeys(left: string, right: string): number {
  const leftRank = keyRank.get(left) ?? Number.MAX_SAFE_INTEGER;
  const rightRank = keyRank.get(right) ?? Number.MAX_SAFE_INTEGER;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return left.localeCompare(right);
}

function shouldPruneValue(key: string, value: unknown): boolean {
  if (value === undefined) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === "object" && value !== null) {
    return Object.keys(value).length === 0;
  }

  if (key === "optional" && value === false) {
    return true;
  }

  if (key === "required" && value === false) {
    return true;
  }

  if (key === "secret" && value === false) {
    return true;
  }

  return false;
}

function orderValueForSerialization(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => orderValueForSerialization(item))
      .filter((item) => !shouldPruneValue(key, item));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const orderedEntries = Object.entries(value)
    .map(
      ([entryKey, entryValue]) =>
        [entryKey, orderValueForSerialization(entryValue, entryKey)] as const
    )
    .filter(([entryKey, entryValue]) => !shouldPruneValue(entryKey, entryValue))
    .sort(([leftKey], [rightKey]) => compareKeys(leftKey, rightKey));

  return Object.fromEntries(orderedEntries);
}

export function serializeRepositoryContractObject(
  contract: RepositoryContract
): RepositoryContract {
  return parseRepositoryContractObject(contract);
}

export function orderRepositoryContractForSerialization(contract: RepositoryContract): unknown {
  return orderValueForSerialization(serializeRepositoryContractObject(contract));
}

export function serializeRepositoryContract(contract: RepositoryContract): string {
  return stringify(orderRepositoryContractForSerialization(contract), {
    aliasDuplicateObjects: false,
    collectionStyle: "block",
    lineWidth: 100,
    sortMapEntries: false
  });
}
