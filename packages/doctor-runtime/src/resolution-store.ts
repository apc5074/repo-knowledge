import { randomUUID } from "node:crypto";

import type { DoctorStateReadResult, DoctorStateStore, ResolutionIndex } from "./state-store.js";
import type { DiagnosticEvidence, KnownProblemRecord, VerifiedResolutionRecord } from "./types.js";

export type ResolutionStore = {
  readonly readAll: () => Promise<DoctorStateReadResult<ResolutionIndex>>;
  readonly recordResolution: (input: RecordResolutionInput) => Promise<VerifiedResolutionRecord>;
  readonly resolveKnownProblem: (
    input: ResolveKnownProblemInput
  ) => Promise<VerifiedResolutionRecord | undefined>;
};

export type RecordResolutionInput = {
  readonly knownProblemId: string;
  readonly resolvedAt?: string;
  readonly verificationRunId?: string;
  readonly evidence: readonly DiagnosticEvidence[];
  readonly notes?: string;
};

export type ResolveKnownProblemInput = {
  readonly problem: KnownProblemRecord;
  readonly evidence: readonly DiagnosticEvidence[];
  readonly verificationRunId?: string;
  readonly notes?: string;
};

export function createResolutionStore(input: {
  readonly stateStore: DoctorStateStore;
  readonly now?: () => string;
  readonly id?: () => string;
}): ResolutionStore {
  const now = input.now ?? (() => new Date().toISOString());
  const createId = input.id ?? randomUUID;

  return {
    readAll: () => input.stateStore.readResolutions(),
    recordResolution: async (recordInput) => {
      const existing = await input.stateStore.readResolutions();
      const record = {
        id: `resolution-${createId()}`,
        knownProblemId: recordInput.knownProblemId,
        resolvedAt: recordInput.resolvedAt ?? now(),
        verificationRunId: recordInput.verificationRunId,
        evidence: recordInput.evidence,
        notes: recordInput.notes
      } satisfies VerifiedResolutionRecord;

      await input.stateStore.writeResolutions([record, ...existing.value.resolutions]);
      return record;
    },
    resolveKnownProblem: async (resolveInput) => {
      if (!hasDirectResolutionEvidence(resolveInput.problem, resolveInput.evidence)) {
        return undefined;
      }

      const existing = await input.stateStore.readResolutions();
      const record = {
        id: `resolution-${createId()}`,
        knownProblemId: resolveInput.problem.id,
        resolvedAt: now(),
        verificationRunId: resolveInput.verificationRunId,
        evidence: resolveInput.evidence,
        notes: resolveInput.notes
      } satisfies VerifiedResolutionRecord;

      await input.stateStore.writeResolutions([record, ...existing.value.resolutions]);
      return record;
    }
  };
}

export function hasDirectResolutionEvidence(
  problem: KnownProblemRecord,
  evidence: readonly DiagnosticEvidence[]
): boolean {
  const targets = new Set(problem.targetIds ?? []);

  return evidence.some((item) => {
    const target =
      item.command ??
      item.path ??
      stringMetadata(item.metadata?.checkId) ??
      stringMetadata(item.metadata?.ownerId) ??
      item.runId;
    const status = item.metadata?.status;
    const directlySuccessful =
      status === "passed" ||
      status === "succeeded" ||
      status === "healthy" ||
      status === "listening";

    return (
      directlySuccessful && (targets.size === 0 || (target !== undefined && targets.has(target)))
    );
  });
}

function stringMetadata(value: string | number | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
