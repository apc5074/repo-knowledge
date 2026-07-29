import { describe, expect, it } from "vitest";

import {
  MissingContractVersionError,
  parseRepositoryContract,
  parseRepositoryContractFile,
  RepositoryContractParseError,
  serializeRepositoryContract,
  UnsupportedContractVersionError,
  validateRepositoryContractDetailed
} from "../src/index.js";
import { fixturePath, listFixtureFiles, readFixture } from "./fixtures.js";

const expectedValidFixtures = ["full.yaml", "minimal.yaml"] as const;

const expectedInvalidFixtures = [
  "duplicate-application-ids.yaml",
  "invalid-command-shape.yaml",
  "invalid-enum.yaml",
  "invalid-path-pattern.yaml",
  "invalid-yaml.yaml",
  "missing-version.yaml",
  "secret-looking-environment-value.yaml",
  "unknown-dependency.yaml",
  "unknown-top-level-field.yaml",
  "unsupported-version.yaml"
] as const;

describe("repository contract fixture suite", () => {
  it("contains the expected valid and invalid fixture files", async () => {
    await expect(listFixtureFiles("valid")).resolves.toEqual([...expectedValidFixtures]);
    await expect(listFixtureFiles("invalid")).resolves.toEqual([...expectedInvalidFixtures]);
  });

  it("parses, validates, serializes, and reparses every valid fixture", async () => {
    for (const fileName of expectedValidFixtures) {
      const contract = await parseRepositoryContractFile(fixturePath("valid", fileName));
      const validation = validateRepositoryContractDetailed(contract);
      const serialized = serializeRepositoryContract(contract);

      expect(validation.ok).toBe(true);
      expect(parseRepositoryContract(serialized)).toEqual(contract);
    }
  });

  it.each([
    [
      "missing-version.yaml",
      MissingContractVersionError,
      "Repository contract version is required"
    ],
    [
      "unsupported-version.yaml",
      UnsupportedContractVersionError,
      "Unsupported repository contract version: 999"
    ]
  ])("protects migration fixture behavior for %s", async (fileName, errorClass, message) => {
    await expect(parseRepositoryContractFile(fixturePath("invalid", fileName))).rejects.toThrow(
      errorClass
    );
    await expect(parseRepositoryContractFile(fixturePath("invalid", fileName))).rejects.toThrow(
      message
    );
  });

  it.each([
    ["duplicate-application-ids.yaml", "yaml"],
    ["invalid-yaml.yaml", "yaml"]
  ])("protects parser fixture behavior for %s", async (fileName, kind) => {
    await expect(
      parseRepositoryContractFile(fixturePath("invalid", fileName))
    ).rejects.toMatchObject({
      kind
    });
  });

  it.each([
    ["invalid-command-shape.yaml", "setup.install.command"],
    ["invalid-enum.yaml", "repository.type"],
    ["invalid-path-pattern.yaml", "generated_files.0.pattern"],
    ["secret-looking-environment-value.yaml", "environment.OPENAI_API_KEY.example_value"],
    ["unknown-dependency.yaml", "applications.worker.depends_on"],
    ["unknown-top-level-field.yaml", "<root>"]
  ])("protects validation fixture behavior for %s", async (fileName, expectedPath) => {
    const text = await readFixture("invalid", fileName);

    expect(() => parseRepositoryContract(text)).toThrow(RepositoryContractParseError);

    try {
      parseRepositoryContract(text);
    } catch (error) {
      expect(error).toBeInstanceOf(RepositoryContractParseError);
      expect((error as RepositoryContractParseError).kind).toBe("validation");
      expect((error as RepositoryContractParseError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expectedPath
          })
        ])
      );
    }
  });

  it("keeps secret-looking fixture values out of detailed validation output", async () => {
    const text = await readFixture("invalid", "secret-looking-environment-value.yaml");

    try {
      parseRepositoryContract(text);
    } catch (error) {
      expect(JSON.stringify((error as RepositoryContractParseError).issues)).not.toContain(
        "sk-project-1234567890abcdef"
      );
    }
  });
});
