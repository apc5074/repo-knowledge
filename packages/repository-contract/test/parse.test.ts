import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  parseRepositoryContract,
  parseRepositoryContractFile,
  RepositoryContractParseError
} from "../src/index.js";

describe("repository contract YAML parser", () => {
  const validYaml = `
version: 1
repository:
  name: orders-service
  type: service
  primary_language: typescript
applications:
  api:
    id: api
    type: api
environment:
  DATABASE_URL:
    name: DATABASE_URL
    required: true
    secret: false
`;

  it("parses valid YAML into typed contract data", () => {
    expect(parseRepositoryContract(validYaml)).toMatchObject({
      version: 1,
      repository: {
        name: "orders-service",
        type: "service",
        primary_language: "typescript"
      },
      applications: {
        api: {
          id: "api",
          type: "api"
        }
      },
      environment: {
        DATABASE_URL: {
          name: "DATABASE_URL",
          required: true,
          secret: false
        }
      }
    });
  });

  it("loads and parses a contract file from the caller-provided path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "board-contract-"));
    const filePath = join(directory, "repository.yaml");

    await writeFile(filePath, validYaml, "utf8");

    await expect(parseRepositoryContractFile(filePath)).resolves.toMatchObject({
      repository: {
        name: "orders-service"
      }
    });
  });

  it("throws a YAML parse error for invalid YAML", () => {
    expect(() =>
      parseRepositoryContract(`
version: 1
repository:
  name: orders-service
    type: service
`)
    ).toThrow(RepositoryContractParseError);

    try {
      parseRepositoryContract(`
version: 1
repository:
  name: orders-service
    type: service
`);
    } catch (error) {
      expect(error).toBeInstanceOf(RepositoryContractParseError);
      expect((error as RepositoryContractParseError).kind).toBe("yaml");
      expect((error as RepositoryContractParseError).message).toContain(
        "Invalid repository contract YAML"
      );
    }
  });

  it("throws a validation parse error for schema-invalid YAML", () => {
    try {
      parseRepositoryContract(`
version: 1
repository:
  name: orders-service
  type: daemon
  primary_language: ruby
`);
    } catch (error) {
      expect(error).toBeInstanceOf(RepositoryContractParseError);
      expect((error as RepositoryContractParseError).kind).toBe("validation");
      expect((error as RepositoryContractParseError).issues).toEqual([
        {
          path: "repository.type",
          message:
            'Invalid option: expected one of "service"|"application"|"library"|"monorepo"|"tooling"|"unknown"'
        },
        {
          path: "repository.primary_language",
          message:
            'Invalid option: expected one of "typescript"|"javascript"|"python"|"go"|"unknown"'
        }
      ]);
    }
  });
});
