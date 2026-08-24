import { createHash } from "node:crypto";

import type {
  DoctorStateReadResult,
  DoctorStateStore,
  LegacyCandidateIndex
} from "./state-store.js";
import type { LegacyCandidateRecord, LegacyReviewStatus } from "./types.js";

export type LegacyCandidateStore = {
  readonly readAll: () => Promise<DoctorStateReadResult<LegacyCandidateIndex>>;
  readonly read: (
    candidateId: string
  ) => Promise<DoctorStateReadResult<LegacyCandidateRecord | undefined>>;
  readonly upsert: (candidate: LegacyCandidateRecord) => Promise<LegacyCandidateRecord>;
  readonly updateReviewStatus: (
    candidateId: string,
    status: LegacyReviewStatus,
    input?: {
      readonly note?: string;
      readonly updatedAt?: string;
    }
  ) => Promise<LegacyCandidateRecord | undefined>;
};

export function createLegacyCandidateStore(input: {
  readonly stateStore: DoctorStateStore;
  readonly now?: () => string;
}): LegacyCandidateStore {
  const now = input.now ?? (() => new Date().toISOString());

  return {
    readAll: () => input.stateStore.readLegacyCandidates(),
    read: (candidateId) => input.stateStore.readLegacyCandidate(candidateId),
    upsert: async (candidate) => {
      const existing = await input.stateStore.readLegacyCandidate(candidate.id);
      const updated =
        existing.value === undefined
          ? candidate
          : mergeCandidate(existing.value, candidate, candidate.updatedAt);
      await input.stateStore.writeLegacyCandidate(updated);
      return updated;
    },
    updateReviewStatus: async (candidateId, status, options = {}) => {
      const existing = await input.stateStore.readLegacyCandidate(candidateId);

      if (existing.value === undefined) {
        return undefined;
      }

      const updated = {
        ...existing.value,
        status,
        updatedAt: options.updatedAt ?? now(),
        reviewerNotes:
          options.note === undefined
            ? existing.value.reviewerNotes
            : [...(existing.value.reviewerNotes ?? []), options.note]
      } satisfies LegacyCandidateRecord;

      await input.stateStore.writeLegacyCandidate(updated);
      return updated;
    }
  };
}

export function stableLegacyCandidateId(input: {
  readonly kind: LegacyCandidateRecord["target"]["kind"];
  readonly value: string;
  readonly path?: string;
}): string {
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 20);

  return `legacy-${hash}`;
}

function mergeCandidate(
  existing: LegacyCandidateRecord,
  candidate: LegacyCandidateRecord,
  updatedAt: string
): LegacyCandidateRecord {
  return {
    ...existing,
    confidence: higherConfidence(existing.confidence, candidate.confidence),
    updatedAt,
    evidence: mergeBySummary(existing.evidence, candidate.evidence),
    counterEvidence: mergeBySummary(existing.counterEvidence, candidate.counterEvidence),
    replacementHints: [...new Set([...existing.replacementHints, ...candidate.replacementHints])],
    signalTypes: [...new Set([...existing.signalTypes, ...candidate.signalTypes])],
    scannerFactIds: [...new Set([...existing.scannerFactIds, ...candidate.scannerFactIds])],
    suggestedReviewAction: candidate.suggestedReviewAction,
    commitSha: candidate.commitSha ?? existing.commitSha,
    inputFingerprint: candidate.inputFingerprint ?? existing.inputFingerprint
  };
}

function mergeBySummary<T extends { readonly summary: string }>(
  left: readonly T[],
  right: readonly T[]
): readonly T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const item of [...left, ...right]) {
    if (seen.has(item.summary)) {
      continue;
    }

    seen.add(item.summary);
    merged.push(item);
  }

  return merged;
}

function higherConfidence(
  left: LegacyCandidateRecord["confidence"],
  right: LegacyCandidateRecord["confidence"]
): LegacyCandidateRecord["confidence"] {
  const rank = {
    low: 1,
    medium: 2,
    high: 3,
    confirmed: 4
  };

  return rank[right] > rank[left] ? right : left;
}
