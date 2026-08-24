import type { DiagnosticEngineResult } from "./diagnostic-engine.js";
import type {
  DiagnosticFinding,
  DoctorReport,
  DoctorRun,
  KnownProblemMatch,
  LegacyCandidateRecord
} from "./types.js";

export type DoctorJsonStatePaths = {
  readonly run?: string;
  readonly latest?: string;
  readonly knownProblems?: string;
  readonly resolutions?: string;
  readonly legacyIndex?: string;
};

export type DoctorJsonOutput = {
  readonly schema_version: 1;
  readonly run_id: string;
  readonly repository_root: string;
  readonly contract_path?: string;
  readonly contract_version?: string;
  readonly categories: readonly string[];
  readonly enabled_inspectors: readonly string[];
  readonly skipped_inspectors: readonly {
    readonly name: string;
    readonly reason: string;
  }[];
  readonly findings: readonly DiagnosticFinding[];
  readonly known_problem_matches: readonly KnownProblemMatch[];
  readonly legacy_candidates: readonly LegacyCandidateSummary[];
  readonly summary: DoctorRun["summary"];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly state_paths: DoctorJsonStatePaths;
};

export type LegacyCandidateSummary = {
  readonly id: string;
  readonly target: LegacyCandidateRecord["target"];
  readonly status: LegacyCandidateRecord["status"];
  readonly confidence: LegacyCandidateRecord["confidence"];
  readonly signal_types: readonly string[];
  readonly replacement_hints: readonly string[];
  readonly suggested_review_action: string;
};

export type SerializeDoctorJsonInput = {
  readonly report: DoctorReport | DoctorRun | DiagnosticEngineResult;
  readonly statePaths?: DoctorJsonStatePaths;
  readonly enabledInspectors?: readonly string[];
};

export function serializeDoctorToJson(input: SerializeDoctorJsonInput): DoctorJsonOutput {
  const run = runFromReport(input.report);
  const skippedInspectors =
    "run" in input.report && "skippedInspectors" in input.report
      ? input.report.skippedInspectors
      : [];

  return stripUndefined({
    schema_version: 1,
    run_id: run.runId,
    repository_root: run.repositoryRoot,
    contract_path: run.contractPath,
    contract_version: run.contractVersion,
    categories: run.categories,
    enabled_inspectors: input.enabledInspectors ?? [],
    skipped_inspectors: skippedInspectors,
    findings: run.findings,
    known_problem_matches: run.knownProblemMatches,
    legacy_candidates: run.legacyCandidates.map(summarizeLegacyCandidate),
    summary: run.summary,
    warnings: run.warnings,
    errors: run.errors,
    state_paths: input.statePaths ?? {}
  }) as DoctorJsonOutput;
}

export function stringifyDoctorJson(input: SerializeDoctorJsonInput): string {
  return JSON.stringify(serializeDoctorToJson(input), null, 2);
}

function runFromReport(report: DoctorReport | DoctorRun | DiagnosticEngineResult): DoctorRun {
  if ("run" in report) {
    return report.run;
  }

  return report;
}

function summarizeLegacyCandidate(candidate: LegacyCandidateRecord): LegacyCandidateSummary {
  return {
    id: candidate.id,
    target: candidate.target,
    status: candidate.status,
    confidence: candidate.confidence,
    signal_types: candidate.signalTypes,
    replacement_hints: candidate.replacementHints,
    suggested_review_action: candidate.suggestedReviewAction
  };
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, stripUndefined(entryValue)])
    );
  }

  return value;
}
