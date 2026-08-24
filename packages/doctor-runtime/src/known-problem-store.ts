import { createHash } from "node:crypto";

import type { DoctorStateReadResult, DoctorStateStore, KnownProblemIndex } from "./state-store.js";
import type {
  DiagnosticEvidence,
  DiagnosticFinding,
  KnownProblemRecord,
  KnownProblemReviewStatus
} from "./types.js";

export type KnownProblemStore = {
  readonly readAll: () => Promise<DoctorStateReadResult<KnownProblemIndex>>;
  readonly upsertFinding: (
    finding: DiagnosticFinding,
    input?: {
      readonly observedAt?: string;
      readonly notes?: readonly string[];
    }
  ) => Promise<KnownProblemRecord>;
  readonly updateStatus: (
    problemId: string,
    status: KnownProblemReviewStatus,
    input?: {
      readonly notes?: readonly string[];
    }
  ) => Promise<KnownProblemRecord | undefined>;
};

export function createKnownProblemStore(input: {
  readonly stateStore: DoctorStateStore;
  readonly now?: () => string;
}): KnownProblemStore {
  const now = input.now ?? (() => new Date().toISOString());

  return {
    readAll: () => input.stateStore.readKnownProblems(),
    upsertFinding: async (finding, options = {}) => {
      const observedAt = options.observedAt ?? now();
      const existing = await input.stateStore.readKnownProblems();
      const fingerprint = fingerprintFinding(finding);
      const current = existing.value.problems.find(
        (problem) => problem.fingerprint === fingerprint
      );
      const record =
        current === undefined
          ? createRecord(finding, fingerprint, observedAt, options.notes ?? [])
          : updateRecord(current, finding, observedAt, options.notes ?? []);
      const problems = [
        record,
        ...existing.value.problems.filter((problem) => problem.id !== record.id)
      ];
      await input.stateStore.writeKnownProblems(problems);
      return record;
    },
    updateStatus: async (problemId, status, options = {}) => {
      const existing = await input.stateStore.readKnownProblems();
      const current = existing.value.problems.find((problem) => problem.id === problemId);

      if (current === undefined) {
        return undefined;
      }

      const updated = {
        ...current,
        status,
        notes: mergeNotes(current.notes ?? [], options.notes ?? [])
      };
      await input.stateStore.writeKnownProblems([
        updated,
        ...existing.value.problems.filter((problem) => problem.id !== problemId)
      ]);
      return updated;
    }
  };
}

export function fingerprintFinding(finding: DiagnosticFinding): string {
  const evidenceTargets = findingTargetIds(finding);

  return createHash("sha256")
    .update(
      JSON.stringify({
        ruleId: finding.ruleId,
        category: finding.category,
        title: normalizeFindingMessage(finding.title),
        targets: evidenceTargets
      })
    )
    .digest("hex")
    .slice(0, 24);
}

export function findingTargetIds(finding: DiagnosticFinding): readonly string[] {
  return targetIds(finding.evidence);
}

export function normalizeFindingMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/\b\d{4}-\d{2}-\d{2}[t ][0-9:.z+-]+\b/gi, "<timestamp>")
    .replace(/\b[0-9a-f]{7,40}\b/gi, "<sha>")
    .replace(/\s+/g, " ")
    .trim();
}

function createRecord(
  finding: DiagnosticFinding,
  fingerprint: string,
  observedAt: string,
  notes: readonly string[]
): KnownProblemRecord {
  return {
    id: `known-${fingerprint}`,
    fingerprint,
    title: finding.title,
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidence,
    status: "unreviewed",
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    occurrenceCount: 1,
    findingIds: [finding.id],
    targetIds: targetIds(finding.evidence),
    notes,
    evidence: finding.evidence,
    counterEvidence: finding.counterEvidence,
    suggestedNextSteps: finding.suggestedNextSteps
  };
}

function updateRecord(
  current: KnownProblemRecord,
  finding: DiagnosticFinding,
  observedAt: string,
  notes: readonly string[]
): KnownProblemRecord {
  return {
    ...current,
    title: finding.title,
    severity: finding.severity,
    confidence: finding.confidence,
    lastSeenAt: observedAt,
    occurrenceCount: current.occurrenceCount + 1,
    findingIds: [...new Set([finding.id, ...current.findingIds])],
    targetIds: [...new Set([...targetIds(finding.evidence), ...(current.targetIds ?? [])])],
    notes: mergeNotes(current.notes ?? [], notes),
    evidence: finding.evidence,
    counterEvidence: finding.counterEvidence,
    suggestedNextSteps: finding.suggestedNextSteps
  };
}

function targetIds(evidence: readonly DiagnosticEvidence[]): readonly string[] {
  return [...new Set(evidence.map(evidenceTarget).filter((target) => target.length > 0))].sort();
}

function evidenceTarget(evidence: DiagnosticEvidence): string {
  return (
    evidence.path ??
    evidence.command ??
    evidence.runId ??
    stringMetadata(evidence.metadata?.ownerId) ??
    stringMetadata(evidence.metadata?.serviceId) ??
    stringMetadata(evidence.metadata?.checkId) ??
    ""
  );
}

function stringMetadata(value: string | number | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function mergeNotes(left: readonly string[], right: readonly string[]): readonly string[] {
  return [...new Set([...left, ...right])];
}
