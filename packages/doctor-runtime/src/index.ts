export { createDiagnosticFinding, runDiagnosticRules } from "./diagnostic-rule.js";
export type {
  DiagnosticRule,
  DiagnosticRuleContext,
  DiagnosticRuleExecutionResult,
  DiagnosticRulePrerequisite,
  DiagnosticRuleRunResult,
  DiagnosticRuleSkip,
  DiagnosticRuleWarning,
  RepositoryReference,
  RepositoryReferenceInventory,
  RunDiagnosticRulesInput
} from "./diagnostic-rule.js";
export { runDiagnosticEngine } from "./diagnostic-engine.js";
export type {
  DiagnosticEngineResult,
  DiagnosticInspector,
  DiagnosticInspectorName,
  DiagnosticInspectorOutput,
  RunDiagnosticEngineInput
} from "./diagnostic-engine.js";
export { runDoctor } from "./doctor-runner.js";
export type { RunDoctorInput, RunDoctorResult } from "./doctor-runner.js";
export { runDoctorAgentTool } from "./agent-tool.js";
export type { DoctorAgentToolRunRecord, RunDoctorAgentToolInput } from "./agent-tool.js";
export {
  defaultDoctorContractPath,
  loadDoctorRepositoryContext,
  resolveDoctorContractPath
} from "./contract-loader.js";
export type {
  DoctorGitMetadata,
  DoctorRepositoryContext,
  GitCommandResult,
  GitCommandRunner,
  LoadDoctorRepositoryContextInput
} from "./contract-loader.js";
export {
  contractCommandReferenceRule,
  contractLoaderFindingRule,
  contractPathReferenceRule,
  createContractReferenceDiagnosticRules,
  documentationReferenceRule
} from "./contract-rules.js";
export { inspectDocker, parseDockerPsJson } from "./docker-inspector.js";
export type {
  DockerCommandResult,
  DockerCommandRunner,
  DockerContainerObservation,
  DockerInspection,
  DockerObservation,
  DockerObservationKind,
  InspectDockerInput
} from "./docker-inspector.js";
export { createDockerDiagnosticRules, dockerObservationRule } from "./docker-rules.js";
export {
  createEnvironmentDiagnosticRules,
  environmentToolRule,
  environmentVariableRule,
  expectedFileRule
} from "./environment-rules.js";
export {
  createBoundedDoctorLogText,
  createRedactedLogEvidence,
  redactDoctorLog
} from "./log-redaction.js";
export type { RedactDoctorLogInput, RedactedDiagnosticLog } from "./log-redaction.js";
export { createKnownProblemStore, fingerprintFinding } from "./known-problem-store.js";
export type { KnownProblemStore } from "./known-problem-store.js";
export { attachKnownProblemMatches, matchKnownProblems } from "./known-problem-matcher.js";
export type { MatchKnownProblemsInput } from "./known-problem-matcher.js";
export { createLegacyCandidateStore, stableLegacyCandidateId } from "./legacy-candidate-store.js";
export type { LegacyCandidateStore } from "./legacy-candidate-store.js";
export { importLegacyCandidatesFromScannerFacts } from "./legacy-candidate-matcher.js";
export type {
  ImportLegacyCandidatesInput,
  ImportLegacyCandidatesResult
} from "./legacy-candidate-matcher.js";
export { serializeDoctorToJson, stringifyDoctorJson } from "./json-output.js";
export type {
  DoctorJsonOutput,
  DoctorJsonStatePaths,
  LegacyCandidateSummary,
  SerializeDoctorJsonInput
} from "./json-output.js";
export {
  collectLocalToolRequirements,
  inspectLocalEnvironment,
  localToolKinds,
  localToolStatuses
} from "./local-environment.js";
export type {
  FileExists,
  InspectLocalEnvironmentInput,
  LocalEnvironmentInspection,
  LocalEnvironmentVariableObservation,
  LocalExpectedFileObservation,
  LocalToolKind,
  LocalToolObservation,
  LocalToolRequirement,
  LocalToolStatus,
  VersionCommandResult,
  VersionCommandRunner
} from "./local-environment.js";
export { inspectRuntimeSessions } from "./runtime-inspector.js";
export type {
  InspectRuntimeSessionsInput,
  RuntimeSessionInspection,
  RuntimeSessionObservation,
  RuntimeSessionObservationKind
} from "./runtime-inspector.js";
export {
  createRuntimeFailureDiagnosticRules,
  repeatedRuntimeFailureRule,
  runtimeObservationRule
} from "./runtime-rules.js";
export { formatHumanDoctorReport } from "./reports.js";
export type { HumanDoctorReport, HumanDoctorReportOptions } from "./reports.js";
export { createResolutionStore, hasDirectResolutionEvidence } from "./resolution-store.js";
export type {
  RecordResolutionInput,
  ResolutionStore,
  ResolveKnownProblemInput
} from "./resolution-store.js";
export { collectExpectedPorts, inspectPorts } from "./port-inspector.js";
export type {
  ExpectedPort,
  InspectPortsInput,
  PortChecker,
  PortCheckResult,
  PortInspection,
  PortObservation,
  PortObservationKind,
  PortOwnerKind,
  PortStatus
} from "./port-inspector.js";
export {
  createPortDiagnosticRules,
  duplicateContractPortRule,
  portObservationRule,
  staleBoardPortRule
} from "./port-rules.js";
export { matchStaleWorkflowCandidates } from "./stale-workflow-matcher.js";
export type {
  StaleWorkflowMatchInput,
  StaleWorkflowMatchResult
} from "./stale-workflow-matcher.js";
export {
  createJsonDoctorStateStore,
  DoctorStateStoreError,
  resolveDoctorStateStorePaths
} from "./state-store.js";
export type {
  DoctorLatestRunPointer,
  DoctorStateReadResult,
  DoctorStateStore,
  DoctorStateStoreOptions,
  DoctorStateStorePaths,
  DoctorStateWarning,
  KnownProblemIndex,
  LegacyCandidateIndex,
  ResolutionIndex
} from "./state-store.js";
export {
  diagnosticCategories,
  diagnosticConfidences,
  diagnosticFindingKinds,
  diagnosticFindingStatuses,
  diagnosticSeverities,
  knownProblemReviewStatuses,
  legacyReviewStatuses
} from "./types.js";
export type {
  DiagnosticCategory,
  DiagnosticConfidence,
  DiagnosticEvidence,
  DiagnosticEvidenceKind,
  DiagnosticFinding,
  DiagnosticFindingKind,
  DiagnosticFindingStatus,
  DiagnosticSeverity,
  DoctorReport,
  DoctorRun,
  KnownProblemMatch,
  KnownProblemRecord,
  KnownProblemReviewStatus,
  LegacyCandidateRecord,
  LegacyReviewStatus,
  RedactedLogExcerpt,
  VerifiedResolutionRecord
} from "./types.js";
export { inspectVerificationHistory } from "./verification-inspector.js";
export type {
  InspectVerificationHistoryInput,
  VerificationHistoryInspection,
  VerificationObservation,
  VerificationObservationKind
} from "./verification-inspector.js";
export {
  createVerificationDiagnosticRules,
  verificationObservationRule,
  verificationStaleConfigRule
} from "./verification-rules.js";

export const doctorRuntimePackage = {
  name: "@repo-knowledge/doctor-runtime",
  owns: "local-diagnostics-known-problems-and-legacy-review",
  phase: "phase-7-doctor-runtime"
} as const;

export type DoctorRuntimePackage = typeof doctorRuntimePackage;

export const doctorDiagnosticCategories = [
  "environment",
  "runtime",
  "docker",
  "ports",
  "verification",
  "contract",
  "docs",
  "legacy"
] as const;

export type DoctorDiagnosticCategory = (typeof doctorDiagnosticCategories)[number];

export const knownProblemStatuses = [
  "observed",
  "matched",
  "acknowledged",
  "resolved",
  "ignored"
] as const;

export type KnownProblemStatus = (typeof knownProblemStatuses)[number];

export const legacyCandidateReviewStatuses = [
  "unreviewed",
  "accepted",
  "rejected",
  "needs-info",
  "resolved"
] as const;

export type LegacyCandidateReviewStatus = (typeof legacyCandidateReviewStatuses)[number];

export const doctorRuntimeBehavior = {
  defaultCommand: "board doctor",
  defaultExitCodeWhenReportProduced: 0,
  supportsJsonOutput: true,
  supportsDryRun: true,
  includeLogsByDefault: false,
  mutatesSourceCode: false,
  usesHostedServices: false,
  usesLlmCalls: false
} as const;

export const doctorRuntimeBoundary = {
  owns: [
    "diagnostic finding models",
    "known local problem records",
    "legacy candidate review records",
    "redacted local diagnostic reports",
    "future agent-compatible doctor tool surface"
  ],
  doesNotOwn: [
    "CLI argument parsing",
    "repository contract schema validation",
    "scanner implementation",
    "bootstrap runtime execution",
    "verification command execution",
    "MCP serving",
    "hosted sync",
    "source mutation"
  ]
} as const;
