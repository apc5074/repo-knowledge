import { typesPackage } from "@repo-knowledge/types";

export const initCorePackage = {
  name: "@repo-knowledge/init-core",
  owns: "contract-initialization-workflow",
  phase: typesPackage.phase
} as const;

export { generateLocalDevelopmentAssumptions } from "./assumptions.js";
export type {
  LocalDevelopmentAssumption,
  LocalDevelopmentAssumptionResult
} from "./assumptions.js";
export { mapScannerFactsToApplications, stableId } from "./applications.js";
export type { ApplicationMappingResult } from "./applications.js";
export { artifactPathsByAction, buildInitArtifactProposals } from "./artifact.js";
export type { BuildInitArtifactProposalsInput } from "./artifact.js";
export { scannerEvidenceToContractEvidence, scannerFactEvidence } from "./evidence.js";
export { attachArtifactDiffs, buildArtifactDiff } from "./diff.js";
export type { InitArtifactDiff } from "./diff.js";
export { isSecretLikeName, mapScannerFactsToEnvironment } from "./environment.js";
export type { EnvironmentMappingInput, EnvironmentMappingResult } from "./environment.js";
export { initializeRepository } from "./init.js";
export { mapScannerFactsToKnownLimitations } from "./limitations.js";
export type { KnownLimitationsMappingInput, KnownLimitationsMappingResult } from "./limitations.js";
export { mergeRepositoryContracts } from "./merge-contract.js";
export type { ContractMergeResult } from "./merge-contract.js";
export { initializationModes, normalizeInitializeRepositoryOptions } from "./options.js";
export type {
  InitAgentMetadata,
  InitializationMode,
  InitializeRepositoryOptions
} from "./options.js";
export { mapScannerFactsToPathRules } from "./paths.js";
export type { PathRulesMappingResult } from "./paths.js";
export { buildContractProposal } from "./proposal.js";
export type { ContractProposalResult, ExistingContractInput } from "./proposal.js";
export { mapScannerFactsToRelationships } from "./relationships.js";
export type { RelationshipMappingResult } from "./relationships.js";
export { buildInitializeRepositoryReview, formatInitializeRepositoryReview } from "./review.js";
export type {
  InitializeRepositoryReviewOutput,
  InitReviewApprovalItem,
  InitReviewArtifact,
  InitReviewFact
} from "./review.js";
export { detectMissingDevelopmentScripts } from "./script-gaps.js";
export type {
  MissingScriptCapability,
  MissingScriptDetectionResult,
  MissingScriptGap
} from "./script-gaps.js";
export { generateScriptProposals } from "./script-proposals.js";
export type { ScriptProposal, ScriptProposalResult } from "./script-proposals.js";
export { initApprovalStatuses } from "./result.js";
export type {
  BuildInitializeRepositoryResultInput,
  InitApprovalStatus,
  InitArtifactProposal,
  InitLocalDevelopmentAssumption,
  InitProposalSummary,
  InitScriptProposal,
  InitWorktreeStatus,
  InitializeRepositoryResult,
  InitReviewItem,
  InitValidationResult,
  InitWorkflowStep
} from "./result.js";
export {
  buildInitializeRepositoryResult,
  createInitProposalSummary,
  summarizeInitializeRepositoryResult
} from "./result.js";
export { serializeContractForInit } from "./serialization.js";
export type { InitSerializedContract } from "./serialization.js";
export { getWorktreeStatus, worktreeWarnings } from "./worktree.js";
export type { WorktreeFileStatus, WorktreeStatus } from "./worktree.js";
export { mapScannerFactsToRepositorySection } from "./scan-to-contract.js";
export type { RepositorySectionMappingResult } from "./scan-to-contract.js";
export { mapScannerFactsToServices } from "./services.js";
export type { ServiceMappingResult } from "./services.js";
export { mapScannerFactsToSetup } from "./setup.js";
export type { SetupMappingResult } from "./setup.js";
export { mapScannerFactsToVerification } from "./verification.js";
export type { VerificationMappingResult } from "./verification.js";
export { ArtifactWriteConflictError, writeArtifactProposals } from "./writer.js";
export type { ArtifactWriteResult } from "./writer.js";
