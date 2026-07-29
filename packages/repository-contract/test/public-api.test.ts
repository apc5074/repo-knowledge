import { describe, expect, it } from "vitest";

import * as publicApi from "../src/index.js";
import type {
  CommandStep,
  DetailedValidationIssue,
  RepositoryContract,
  ValidationIssue
} from "../src/index.js";

const expectedRuntimeExports = [
  "CURRENT_CONTRACT_VERSION",
  "MissingContractVersionError",
  "RepositoryContractParseError",
  "SUPPORTED_CONTRACT_VERSIONS",
  "UnsupportedContractVersionError",
  "agentTraceMetadataSchema",
  "applicationSchema",
  "applicationTypeValues",
  "applicationsSchema",
  "commandStepSchema",
  "confidenceValues",
  "contractMetadataSchema",
  "contractMigrations",
  "environmentSchema",
  "environmentVariableSchema",
  "evidenceKindValues",
  "evidenceSchema",
  "externalSystemSchema",
  "externalSystemTypeValues",
  "externalSystemsSchema",
  "fieldMetadataSchema",
  "formatDetailedZodIssues",
  "formatValidationIssuesForHuman",
  "formatValidationIssuesForJson",
  "formatZodIssues",
  "generatedPathSchema",
  "getContractMigrations",
  "getContractVersion",
  "healthCheckSchema",
  "knownLimitationSchema",
  "knownLimitationStatusValues",
  "knownLimitationsSchema",
  "languageValues",
  "maintenanceMetadataSchema",
  "migrateRepositoryContractInput",
  "normalizeCommand",
  "orderRepositoryContractForSerialization",
  "parseRepositoryContract",
  "parseRepositoryContractFile",
  "parseRepositoryContractObject",
  "pathRuleSchema",
  "relatedRepositoriesSchema",
  "relatedRepositorySchema",
  "relationshipDirectionValues",
  "relationshipTypeValues",
  "repositoryContractSchema",
  "repositoryProviderValues",
  "repositoryPurposeSchema",
  "repositorySectionSchema",
  "repositoryTypeValues",
  "reviewStatusValues",
  "sensitivePathSchema",
  "serializeRepositoryContract",
  "serializeRepositoryContractObject",
  "serviceSchema",
  "serviceTypeValues",
  "servicesSchema",
  "setupSchema",
  "setupStepKindValues",
  "setupStepSchema",
  "sourceOfTruthPathSchema",
  "unsafePathSchema",
  "validateRepositoryContract",
  "validateRepositoryContractDetailed",
  "validateRepositorySection",
  "validateRepositorySectionDetailed",
  "verificationCheckKindValues",
  "verificationCheckSchema",
  "verificationRuleSchema",
  "verificationSchema",
  "verificationStatusValues"
] as const;

describe("repository contract public API", () => {
  it("keeps the documented runtime export surface stable", () => {
    expect(Object.keys(publicApi).sort()).toEqual([...expectedRuntimeExports].sort());
  });

  it("supports importing the core parser, serializer, validator, and schema APIs", () => {
    const contract = publicApi.parseRepositoryContractObject({
      version: 1,
      repository: {
        name: "api-stability",
        type: "service",
        primary_language: "typescript"
      }
    });

    expect(publicApi.validateRepositoryContract(contract).ok).toBe(true);
    expect(publicApi.serializeRepositoryContract(contract)).toContain("api-stability");
    expect(publicApi.repositoryContractSchema.parse(contract)).toMatchObject({
      version: 1,
      repository: {
        name: "api-stability"
      }
    });
  });

  it("keeps core exported types usable by future phases", () => {
    const command: CommandStep = {
      command: "pnpm",
      args: ["test"],
      environment: [],
      requires: [],
      optional: false,
      evidence: []
    };
    const issue: ValidationIssue = {
      path: "repository.name",
      message: "repository.name is required"
    };
    const detailedIssue: DetailedValidationIssue = {
      ...issue,
      code: "custom",
      severity: "error"
    };
    const contract: RepositoryContract = publicApi.parseRepositoryContractObject({
      version: 1,
      repository: {
        name: "typed-contract",
        type: "service",
        primary_language: "typescript"
      },
      setup: {
        install: command
      }
    });

    expect(contract.repository.name).toBe("typed-contract");
    expect(detailedIssue.severity).toBe("error");
  });
});
