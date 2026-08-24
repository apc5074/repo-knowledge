export const diagnosticCategories = [
  "environment",
  "runtime",
  "docker",
  "ports",
  "verification",
  "contract",
  "docs",
  "legacy"
] as const;

export type DiagnosticCategory = (typeof diagnosticCategories)[number];

export const diagnosticSeverities = ["info", "warning", "error", "blocking"] as const;

export type DiagnosticSeverity = (typeof diagnosticSeverities)[number];

export const diagnosticConfidences = ["low", "medium", "high", "confirmed"] as const;

export type DiagnosticConfidence = (typeof diagnosticConfidences)[number];

export const diagnosticFindingKinds = ["direct_local_fact", "inferred_candidate"] as const;

export type DiagnosticFindingKind = (typeof diagnosticFindingKinds)[number];

export const diagnosticFindingStatuses = [
  "open",
  "matched_known_problem",
  "acknowledged",
  "resolved",
  "ignored"
] as const;

export type DiagnosticFindingStatus = (typeof diagnosticFindingStatuses)[number];

export const knownProblemReviewStatuses = [
  "unreviewed",
  "acknowledged",
  "false_positive",
  "resolved"
] as const;

export type KnownProblemReviewStatus = (typeof knownProblemReviewStatuses)[number];

export const legacyReviewStatuses = [
  "unreviewed",
  "acknowledged",
  "false_positive",
  "accepted",
  "resolved"
] as const;

export type LegacyReviewStatus = (typeof legacyReviewStatuses)[number];

export type DiagnosticEvidenceKind =
  | "command"
  | "contract"
  | "docker"
  | "environment"
  | "file"
  | "git"
  | "log_excerpt"
  | "port"
  | "runtime_session"
  | "scanner_fact"
  | "verification_run";

export type DiagnosticEvidence = {
  readonly kind: DiagnosticEvidenceKind;
  readonly summary: string;
  readonly source?: string;
  readonly path?: string;
  readonly line?: number;
  readonly command?: string;
  readonly runId?: string;
  readonly excerpt?: RedactedLogExcerpt;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
};

export type RedactedLogExcerpt = {
  readonly text: string;
  readonly redacted: true;
  readonly truncated: boolean;
  readonly maxCharacters: number;
};

export type DiagnosticFinding = {
  readonly id: string;
  readonly ruleId: string;
  readonly category: DiagnosticCategory;
  readonly kind: DiagnosticFindingKind;
  readonly severity: DiagnosticSeverity;
  readonly confidence: DiagnosticConfidence;
  readonly status: DiagnosticFindingStatus;
  readonly title: string;
  readonly summary: string;
  readonly evidence: readonly DiagnosticEvidence[];
  readonly counterEvidence: readonly DiagnosticEvidence[];
  readonly suggestedNextSteps: readonly string[];
  readonly matchedKnownProblemIds: readonly string[];
};

export type KnownProblemRecord = {
  readonly id: string;
  readonly fingerprint: string;
  readonly title: string;
  readonly category: DiagnosticCategory;
  readonly severity: DiagnosticSeverity;
  readonly confidence: DiagnosticConfidence;
  readonly status: KnownProblemReviewStatus;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly occurrenceCount: number;
  readonly findingIds: readonly string[];
  readonly evidence: readonly DiagnosticEvidence[];
  readonly counterEvidence: readonly DiagnosticEvidence[];
  readonly suggestedNextSteps: readonly string[];
};

export type KnownProblemMatch = {
  readonly knownProblemId: string;
  readonly findingId: string;
  readonly confidence: DiagnosticConfidence;
  readonly matchedOn: readonly string[];
  readonly evidence: readonly DiagnosticEvidence[];
};

export type VerifiedResolutionRecord = {
  readonly id: string;
  readonly knownProblemId: string;
  readonly resolvedAt: string;
  readonly verificationRunId?: string;
  readonly evidence: readonly DiagnosticEvidence[];
  readonly notes?: string;
};

export type LegacyCandidateRecord = {
  readonly id: string;
  readonly target: {
    readonly kind: "path" | "symbol" | "command" | "route" | "component" | "doc_reference";
    readonly value: string;
    readonly path?: string;
  };
  readonly signalTypes: readonly string[];
  readonly confidence: DiagnosticConfidence;
  readonly status: LegacyReviewStatus;
  readonly detectedAt: string;
  readonly updatedAt: string;
  readonly evidence: readonly DiagnosticEvidence[];
  readonly counterEvidence: readonly DiagnosticEvidence[];
  readonly replacementHints: readonly string[];
  readonly suggestedReviewAction: string;
  readonly scannerFactIds: readonly string[];
  readonly commitSha?: string;
  readonly inputFingerprint?: string;
  readonly reviewerNotes?: readonly string[];
};

export type DoctorRun = {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly repositoryRoot: string;
  readonly contractPath?: string;
  readonly contractVersion?: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly categories: readonly DiagnosticCategory[];
  readonly findings: readonly DiagnosticFinding[];
  readonly knownProblemMatches: readonly KnownProblemMatch[];
  readonly legacyCandidates: readonly LegacyCandidateRecord[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly summary: {
    readonly totalFindings: number;
    readonly bySeverity: Readonly<Record<DiagnosticSeverity, number>>;
    readonly byCategory: Readonly<Record<DiagnosticCategory, number>>;
    readonly directLocalFacts: number;
    readonly inferredCandidates: number;
  };
};

export type DoctorReport = {
  readonly ok: boolean;
  readonly run: DoctorRun;
  readonly knownProblems: readonly KnownProblemRecord[];
  readonly resolutions: readonly VerifiedResolutionRecord[];
  readonly nextSteps: readonly string[];
};
