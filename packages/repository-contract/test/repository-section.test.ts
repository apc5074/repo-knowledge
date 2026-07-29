import { describe, expect, it } from "vitest";

import {
  parseRepositoryContractObject,
  repositorySectionSchema,
  validateRepositoryContract,
  validateRepositorySection
} from "../src/index.js";

describe("repository section schema", () => {
  it("accepts a valid minimal repository section", () => {
    expect(
      validateRepositorySection({
        name: "orders-service",
        type: "service",
        primary_language: "typescript"
      })
    ).toEqual({
      ok: true,
      data: {
        name: "orders-service",
        type: "service",
        primary_language: "typescript",
        languages: [],
        root: ".",
        owners: [],
        tags: []
      },
      issues: []
    });
  });

  it("allows purpose to be absent for early generated contracts", () => {
    const result = repositorySectionSchema.parse({
      name: "unknown-repo",
      type: "unknown",
      primary_language: "unknown"
    });

    expect(result.purpose).toBeUndefined();
  });

  it("accepts agent-maintained purpose metadata", () => {
    const result = repositorySectionSchema.parse({
      name: "orders-service",
      purpose: {
        value: "Owns order creation and lifecycle management.",
        metadata: {
          source: "agent",
          review_status: "approval_required",
          review_required: true,
          agent_run_id: "run_123",
          tool_call_id: "tool_123",
          proposal_id: "proposal_123",
          approval_id: "approval_123"
        }
      },
      type: "service",
      primary_language: "typescript"
    });

    expect(result.purpose).toEqual({
      value: "Owns order creation and lifecycle management.",
      metadata: {
        source: "agent",
        review_status: "approval_required",
        review_required: true,
        agent_run_id: "run_123",
        tool_call_id: "tool_123",
        proposal_id: "proposal_123",
        approval_id: "approval_123"
      }
    });
  });

  it("reports missing repository identity fields with paths", () => {
    expect(validateRepositorySection({})).toEqual({
      ok: false,
      issues: [
        {
          path: "name",
          message: "Invalid input: expected string, received undefined"
        },
        {
          path: "type",
          message:
            'Invalid option: expected one of "service"|"application"|"library"|"monorepo"|"tooling"|"unknown"'
        },
        {
          path: "primary_language",
          message:
            'Invalid option: expected one of "typescript"|"javascript"|"python"|"go"|"unknown"'
        }
      ]
    });
  });

  it("reports unknown enum values with allowed values", () => {
    const result = validateRepositorySection({
      name: "orders-service",
      type: "daemon",
      primary_language: "ruby"
    });

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          path: "type",
          message:
            'Invalid option: expected one of "service"|"application"|"library"|"monorepo"|"tooling"|"unknown"'
        },
        {
          path: "primary_language",
          message:
            'Invalid option: expected one of "typescript"|"javascript"|"python"|"go"|"unknown"'
        }
      ]
    });
  });

  it("validates the core contract object", () => {
    expect(
      validateRepositoryContract({
        version: 1,
        repository: {
          name: "orders-service",
          type: "service",
          primary_language: "typescript"
        }
      }).ok
    ).toBe(true);
  });

  it("throws readable errors when parsing invalid contract objects", () => {
    expect(() =>
      parseRepositoryContractObject({
        version: 1,
        repository: {}
      })
    ).toThrow("Invalid repository contract: repository.name");
  });
});
