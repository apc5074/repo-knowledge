import type { RepositoryContract } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import { mergeRepositoryContracts } from "../src/index.js";

describe("existing repository contract merge", () => {
  it("preserves human-authored repository fields", () => {
    const result = mergeRepositoryContracts({
      existing: existingContract({
        repository: {
          name: "human-name",
          type: "service",
          primary_language: "typescript",
          purpose: "Human-authored purpose.",
          owners: ["platform"]
        }
      }),
      generated: generatedContract()
    });

    expect(result.contract.repository).toMatchObject({
      name: "generated-name",
      purpose: "Human-authored purpose.",
      owners: ["platform"]
    });
  });

  it("adds generated entries without removing existing entries", () => {
    const result = mergeRepositoryContracts({
      existing: existingContract({
        applications: {
          worker: {
            id: "worker",
            type: "worker",
            working_directory: "apps/worker"
          }
        }
      }),
      generated: generatedContract()
    });

    expect(Object.keys(result.contract.applications ?? {})).toEqual(["api", "worker"]);
  });

  it("preserves conflicting existing entries and emits review items", () => {
    const result = mergeRepositoryContracts({
      existing: existingContract({
        environment: {
          DATABASE_URL: {
            name: "DATABASE_URL",
            required: true,
            secret: true,
            source: "human"
          }
        }
      }),
      generated: generatedContract()
    });

    expect(result.contract.environment?.DATABASE_URL).toMatchObject({
      required: true,
      source: "human"
    });
    expect(result.reviewItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "merge-environment-database_url",
          kind: "conflict"
        })
      ])
    );
  });
});

function generatedContract(): RepositoryContract {
  return {
    version: 1,
    repository: {
      name: "generated-name",
      type: "service",
      primary_language: "typescript",
      languages: ["typescript"]
    },
    applications: {
      api: {
        id: "api",
        type: "api",
        working_directory: ".",
        environment: ["DATABASE_URL"]
      }
    },
    environment: {
      DATABASE_URL: {
        name: "DATABASE_URL",
        required: false,
        secret: true,
        source: "scanner"
      }
    }
  };
}

function existingContract(partial: Partial<RepositoryContract>): RepositoryContract {
  return {
    version: 1,
    repository: {
      name: "existing-name",
      type: "service",
      primary_language: "typescript"
    },
    ...partial
  };
}
