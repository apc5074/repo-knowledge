import type { z } from "zod";

import type {
  agentTraceMetadataSchema,
  applicationSchema,
  applicationsSchema,
  commandStepSchema,
  contractMetadataSchema,
  environmentSchema,
  environmentVariableSchema,
  externalSystemSchema,
  externalSystemsSchema,
  evidenceSchema,
  fieldMetadataSchema,
  generatedPathSchema,
  healthCheckSchema,
  knownLimitationSchema,
  knownLimitationsSchema,
  maintenanceMetadataSchema,
  pathRuleSchema,
  relatedRepositoriesSchema,
  relatedRepositorySchema,
  repositoryContractSchema,
  repositoryPurposeSchema,
  repositorySectionSchema,
  sensitivePathSchema,
  setupSchema,
  setupStepSchema,
  serviceSchema,
  servicesSchema,
  sourceOfTruthPathSchema,
  unsafePathSchema,
  verificationCheckSchema,
  verificationRuleSchema,
  verificationSchema
} from "./schema.js";

export type AgentTraceMetadata = z.infer<typeof agentTraceMetadataSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type CommandStep = z.infer<typeof commandStepSchema>;
export type ContractMetadata = z.infer<typeof contractMetadataSchema>;
export type MaintenanceMetadata = z.infer<typeof maintenanceMetadataSchema>;
export type HealthCheck = z.infer<typeof healthCheckSchema>;
export type Application = z.infer<typeof applicationSchema>;
export type Applications = z.infer<typeof applicationsSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type Services = z.infer<typeof servicesSchema>;
export type EnvironmentVariable = z.infer<typeof environmentVariableSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type SetupStep = z.infer<typeof setupStepSchema>;
export type Setup = z.infer<typeof setupSchema>;
export type VerificationCheck = z.infer<typeof verificationCheckSchema>;
export type VerificationRule = z.infer<typeof verificationRuleSchema>;
export type Verification = z.infer<typeof verificationSchema>;
export type PathRule = z.infer<typeof pathRuleSchema>;
export type GeneratedPath = z.infer<typeof generatedPathSchema>;
export type SensitivePath = z.infer<typeof sensitivePathSchema>;
export type UnsafePath = z.infer<typeof unsafePathSchema>;
export type SourceOfTruthPath = z.infer<typeof sourceOfTruthPathSchema>;
export type RelatedRepository = z.infer<typeof relatedRepositorySchema>;
export type RelatedRepositories = z.infer<typeof relatedRepositoriesSchema>;
export type ExternalSystem = z.infer<typeof externalSystemSchema>;
export type ExternalSystems = z.infer<typeof externalSystemsSchema>;
export type KnownLimitation = z.infer<typeof knownLimitationSchema>;
export type KnownLimitations = z.infer<typeof knownLimitationsSchema>;
export type FieldMetadata = z.infer<typeof fieldMetadataSchema>;
export type RepositoryPurpose = z.infer<typeof repositoryPurposeSchema>;
export type RepositorySection = z.infer<typeof repositorySectionSchema>;
export type RepositoryContract = z.infer<typeof repositoryContractSchema>;
