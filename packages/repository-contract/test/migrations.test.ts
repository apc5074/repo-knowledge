import { describe, expect, it } from "vitest";

import {
  CURRENT_CONTRACT_VERSION,
  getContractMigrations,
  getContractVersion,
  migrateRepositoryContractInput,
  MissingContractVersionError,
  parseRepositoryContractObject,
  SUPPORTED_CONTRACT_VERSIONS,
  UnsupportedContractVersionError
} from "../src/index.js";

describe("repository contract versioning and migrations", () => {
  it("defines version 1 as the current supported MVP contract version", () => {
    expect(CURRENT_CONTRACT_VERSION).toBe(1);
    expect(SUPPORTED_CONTRACT_VERSIONS).toEqual([1]);
  });

  it("parses version 1 contracts", () => {
    expect(
      parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "orders-service",
          type: "service",
          primary_language: "typescript"
        }
      })
    ).toMatchObject({
      version: 1,
      repository: {
        name: "orders-service"
      }
    });
  });

  it("exposes a no-op v1 migration entry for future extension", () => {
    const migrations = getContractMigrations();

    expect(migrations).toHaveLength(1);
    expect(migrations[0]).toMatchObject({
      fromVersion: 1,
      toVersion: 1,
      description: "Version 1 is the initial repository contract schema."
    });
    expect(migrations[0]?.migrate({ version: 1 })).toEqual({ version: 1 });
  });

  it("extracts the contract version before schema validation", () => {
    expect(getContractVersion({ version: 1 })).toBe(1);
  });

  it("throws a clear error when version is missing", () => {
    expect(() =>
      parseRepositoryContractObject({
        repository: {
          name: "orders-service",
          type: "service",
          primary_language: "typescript"
        }
      })
    ).toThrow(MissingContractVersionError);

    expect(() => migrateRepositoryContractInput({})).toThrow(
      "Repository contract version is required"
    );
  });

  it("throws a clear error for unsupported future versions", () => {
    expect(() =>
      parseRepositoryContractObject({
        version: 999,
        repository: {
          name: "orders-service",
          type: "service",
          primary_language: "typescript"
        }
      })
    ).toThrow(UnsupportedContractVersionError);

    expect(() => migrateRepositoryContractInput({ version: 999 })).toThrow(
      "Unsupported repository contract version: 999"
    );
  });
});
