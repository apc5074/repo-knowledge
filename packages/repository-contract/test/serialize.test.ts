import { describe, expect, it } from "vitest";

import {
  parseRepositoryContract,
  parseRepositoryContractObject,
  serializeRepositoryContract
} from "../src/index.js";

describe("repository contract serializer", () => {
  const contract = parseRepositoryContractObject({
    version: 1,
    repository: {
      name: "orders-service",
      type: "service",
      primary_language: "typescript"
    },
    environment: {
      DATABASE_URL: {
        name: "DATABASE_URL",
        required: true,
        secret: false
      }
    },
    applications: {
      api: {
        id: "api",
        type: "api",
        working_directory: "apps/api",
        environment: ["DATABASE_URL"]
      }
    },
    setup: {
      install: {
        command: "pnpm",
        args: ["install"]
      }
    },
    verification: {
      default: [
        {
          id: "typecheck",
          kind: "typecheck",
          command: {
            command: "pnpm",
            args: ["typecheck"]
          }
        }
      ]
    }
  });

  it("serializes contracts to deterministic reviewable YAML", () => {
    const first = serializeRepositoryContract(contract);
    const second = serializeRepositoryContract(contract);

    expect(first).toBe(second);
    expect(first).toMatchInlineSnapshot(`
      "version: 1
      repository:
        name: orders-service
        type: service
        primary_language: typescript
        root: .
      applications:
        api:
          id: api
          type: api
          working_directory: apps/api
          environment:
            - DATABASE_URL
      environment:
        DATABASE_URL:
          name: DATABASE_URL
          required: true
      setup:
        install:
          command: pnpm
          args:
            - install
      verification:
        default:
          - id: typecheck
            kind: typecheck
            command:
              command: pnpm
              args:
                - typecheck
      "
    `);
  });

  it("round-trips serialized output through the parser", () => {
    const serialized = serializeRepositoryContract(contract);

    expect(parseRepositoryContract(serialized)).toEqual(contract);
  });

  it("omits empty optional sections and schema-default noise", () => {
    const serialized = serializeRepositoryContract(contract);

    expect(serialized).not.toContain("related_repositories");
    expect(serialized).not.toContain("known_limitations");
    expect(serialized).not.toContain("optional: false");
    expect(serialized).not.toContain("secret: false");
    expect(serialized).not.toContain("ports: []");
  });
});
