import {
  parseRepositoryContract,
  RepositoryContractParseError,
  validateRepositoryContractDetailed,
  type RepositoryContract
} from "@repo-knowledge/repository-contract";
import type { RepositoryScanResult } from "@repo-knowledge/scanner-core";

import { mapScannerFactsToApplications } from "./applications.js";
import { mapScannerFactsToEnvironment } from "./environment.js";
import { mapScannerFactsToKnownLimitations } from "./limitations.js";
import { mergeRepositoryContracts } from "./merge-contract.js";
import { mapScannerFactsToPathRules } from "./paths.js";
import { mapScannerFactsToRelationships } from "./relationships.js";
import type { InitReviewItem, InitValidationResult } from "./result.js";
import { mapScannerFactsToRepositorySection } from "./scan-to-contract.js";
import { mapScannerFactsToServices } from "./services.js";
import { mapScannerFactsToSetup } from "./setup.js";
import { mapScannerFactsToVerification } from "./verification.js";

export type ExistingContractInput = {
  readonly path: string;
  readonly content: string;
};

export type ContractProposalResult = {
  readonly contract: RepositoryContract;
  readonly generatedContract: RepositoryContract;
  readonly existingContract?: RepositoryContract;
  readonly existingContractInvalid: boolean;
  readonly reviewItems: readonly InitReviewItem[];
  readonly inferredFields: readonly string[];
  readonly unconfirmedFields: readonly string[];
  readonly validation: InitValidationResult;
  readonly warnings: readonly string[];
  readonly summary: string;
};

export function buildContractProposal(input: {
  readonly repositoryRoot: string;
  readonly scan: RepositoryScanResult;
  readonly existingContract?: ExistingContractInput;
}): ContractProposalResult {
  const generated = buildGeneratedContract(input.repositoryRoot, input.scan);

  if (input.existingContract === undefined) {
    return validateProposal({
      contract: generated.contract,
      generatedContract: generated.contract,
      existingContractInvalid: false,
      reviewItems: generated.reviewItems,
      inferredFields: generated.inferredFields,
      unconfirmedFields: generated.unconfirmedFields,
      warnings: [],
      summary: generated.summary
    });
  }

  const existing = parseExistingContract(input.existingContract);

  if (existing.reviewItem !== undefined) {
    return validateProposal({
      contract: generated.contract,
      generatedContract: generated.contract,
      existingContractInvalid: true,
      reviewItems: [...generated.reviewItems, existing.reviewItem],
      inferredFields: generated.inferredFields,
      unconfirmedFields: [...generated.unconfirmedFields, existing.reviewItem.id],
      warnings: [
        `Existing contract ${input.existingContract.path} could not be parsed or validated.`
      ],
      summary: `${generated.summary} Existing contract could not be merged.`
    });
  }

  const merge = mergeRepositoryContracts({
    existing: existing.contract,
    generated: generated.contract
  });

  return validateProposal({
    contract: merge.contract,
    generatedContract: generated.contract,
    existingContract: existing.contract,
    existingContractInvalid: false,
    reviewItems: [...generated.reviewItems, ...merge.reviewItems],
    inferredFields: [...generated.inferredFields, ...merge.inferredFields],
    unconfirmedFields: generated.unconfirmedFields,
    warnings: [],
    summary: `${generated.summary} Merged existing contract values where present.`
  });
}

function buildGeneratedContract(
  repositoryRoot: string,
  scan: RepositoryScanResult
): Omit<
  ContractProposalResult,
  "existingContract" | "existingContractInvalid" | "validation" | "warnings"
> {
  const repositoryMapping = mapScannerFactsToRepositorySection({
    repositoryRoot,
    facts: scan.facts
  });
  const applicationMapping = mapScannerFactsToApplications(scan.facts);
  const serviceMapping = mapScannerFactsToServices(scan.facts);
  const environmentMapping = mapScannerFactsToEnvironment({
    facts: scan.facts,
    applications: applicationMapping.applications,
    services: serviceMapping.services
  });
  const setupMapping = mapScannerFactsToSetup(scan.facts);
  const verificationMapping = mapScannerFactsToVerification(scan.facts);
  const pathRulesMapping = mapScannerFactsToPathRules(scan.facts);
  const relationshipMapping = mapScannerFactsToRelationships(scan.facts);
  const knownLimitationsMapping = mapScannerFactsToKnownLimitations({
    facts: scan.facts,
    services: serviceMapping.services,
    setup: setupMapping.setup
  });
  const contract: RepositoryContract = {
    version: 1,
    repository: repositoryMapping.repository,
    applications: applicationMapping.applications,
    services: serviceMapping.services,
    environment: environmentMapping.environment,
    setup: setupMapping.setup,
    verification: verificationMapping.verification,
    generated_files: [...pathRulesMapping.generatedFiles],
    sensitive_paths: [...pathRulesMapping.sensitivePaths],
    unsafe_paths: [...pathRulesMapping.unsafePaths],
    source_of_truth_paths: [...pathRulesMapping.sourceOfTruthPaths],
    related_repositories: [...relationshipMapping.relatedRepositories],
    external_systems: [...relationshipMapping.externalSystems],
    known_limitations: [...knownLimitationsMapping.knownLimitations]
  };

  return {
    contract,
    generatedContract: contract,
    reviewItems: [
      ...repositoryMapping.reviewItems,
      ...applicationMapping.reviewItems,
      ...serviceMapping.reviewItems,
      ...environmentMapping.reviewItems,
      ...setupMapping.reviewItems,
      ...verificationMapping.reviewItems,
      ...pathRulesMapping.reviewItems,
      ...relationshipMapping.reviewItems,
      ...knownLimitationsMapping.reviewItems
    ],
    inferredFields: [
      ...repositoryMapping.inferredFields,
      ...applicationMapping.inferredFields,
      ...serviceMapping.inferredFields,
      ...environmentMapping.inferredFields,
      ...setupMapping.inferredFields,
      ...verificationMapping.inferredFields,
      ...pathRulesMapping.inferredFields,
      ...relationshipMapping.inferredFields,
      ...knownLimitationsMapping.inferredFields
    ],
    unconfirmedFields: [
      ...repositoryMapping.unconfirmedFields,
      ...applicationMapping.unconfirmedFields,
      ...environmentMapping.unconfirmedFields
    ],
    summary: `Mapped ${Object.keys(applicationMapping.applications).length} applications, ${Object.keys(serviceMapping.services).length} services, ${Object.keys(environmentMapping.environment).length} environment variables, ${pathRulesMapping.generatedFiles.length} generated paths, ${relationshipMapping.externalSystems.length} external systems, ${knownLimitationsMapping.knownLimitations.length} known limitations, ${Object.keys(setupMapping.setup).length} setup entries, and ${verificationMapping.verification.default?.length ?? 0} verification checks.`
  };
}

function parseExistingContract(input: ExistingContractInput):
  | {
      readonly contract: RepositoryContract;
      readonly reviewItem?: undefined;
    }
  | {
      readonly contract?: undefined;
      readonly reviewItem: InitReviewItem;
    } {
  try {
    return {
      contract: parseRepositoryContract(input.content)
    };
  } catch (error) {
    const issues =
      error instanceof RepositoryContractParseError
        ? error.issues.map((issue) => `${issue.path}: ${issue.message}`)
        : [];
    const summary =
      issues.length > 0
        ? issues.join("; ")
        : error instanceof RepositoryContractParseError
          ? error.message
          : `Could not parse existing contract: ${String(error)}`;

    return {
      reviewItem: {
        id: "existing-contract-invalid",
        kind: "conflict",
        title: "Existing repository contract is invalid",
        summary,
        evidence: [input.path, ...issues]
      }
    };
  }
}

function validateProposal(
  input: Omit<ContractProposalResult, "validation">
): ContractProposalResult {
  const validation = validateRepositoryContractDetailed(input.contract);

  return {
    ...input,
    contract: validation.ok ? validation.data : input.contract,
    validation: {
      ok: validation.ok,
      issues: validation.ok
        ? []
        : validation.issues.map((issue) => `${issue.path}: ${issue.message}`)
    }
  };
}
