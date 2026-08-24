import {
  createJsonDoctorStateStore,
  createLegacyCandidateStore,
  legacyReviewStatuses,
  resolveDoctorStateStorePaths,
  type LegacyCandidateRecord,
  type LegacyReviewStatus
} from "@repo-knowledge/doctor-runtime";

import type { CommandContext } from "../command-context.js";
import { usageError } from "../errors/board-error.js";
import { buildFailureResult, buildSuccessResult, type CommandResult } from "../output/result.js";

export type LegacyListCommandOptions = {
  readonly status?: string;
  readonly confidence?: string;
  readonly json?: boolean;
};

export type LegacyExplainCommandOptions = {
  readonly json?: boolean;
};

export type LegacyReviewCommandOptions = {
  readonly status?: string;
  readonly note?: string;
};

export async function legacyListCommand(
  context: CommandContext,
  options: LegacyListCommandOptions = {}
): Promise<CommandResult> {
  const store = await loadLegacyStore(context, "legacy list");

  if (!store.ok) {
    return store.result;
  }

  const index = await store.store.readAll();
  const candidates = filterCandidates(index.value.candidates, options);
  const summary =
    candidates.length === 0
      ? "No legacy candidates found."
      : `Found ${candidates.length} legacy candidate(s).`;

  return buildSuccessResult(context, {
    command: "legacy list",
    status: index.warnings.length > 0 ? "warning" : "success",
    summary: context.outputMode === "json" ? summary : formatCandidateList(summary, candidates),
    data: {
      legacy: {
        candidates,
        count: candidates.length
      }
    },
    warnings: index.warnings.map((warning) => warning.message),
    candidate_findings: candidates.map(candidateFinding)
  });
}

export async function legacyExplainCommand(
  context: CommandContext,
  candidateId: string
): Promise<CommandResult> {
  const store = await loadLegacyStore(context, "legacy explain");

  if (!store.ok) {
    return store.result;
  }

  const candidate = await store.store.read(candidateId);

  if (candidate.value === undefined) {
    return buildFailureResult(context, {
      command: "legacy explain",
      summary: `Legacy candidate ${candidateId} was not found.`,
      errors: [
        {
          code: "legacy-candidate-not-found",
          message: `Legacy candidate ${candidateId} was not found.`
        }
      ],
      next_steps: ["Run board doctor, then run board legacy list again."]
    });
  }

  return buildSuccessResult(context, {
    command: "legacy explain",
    summary:
      context.outputMode === "json"
        ? `Legacy candidate ${candidate.value.id}.`
        : formatCandidateExplanation(candidate.value),
    data: {
      legacy: {
        candidate: candidate.value
      }
    },
    warnings: candidate.warnings.map((warning) => warning.message),
    candidate_findings: [candidateFinding(candidate.value)]
  });
}

export async function legacyReviewCommand(
  context: CommandContext,
  candidateId: string,
  options: LegacyReviewCommandOptions = {}
): Promise<CommandResult> {
  const status = normalizeReviewStatus(options.status);
  const store = await loadLegacyStore(context, "legacy review");

  if (!store.ok) {
    return store.result;
  }

  const candidate = await store.store.updateReviewStatus(candidateId, status, {
    note: options.note
  });

  if (candidate === undefined) {
    return buildFailureResult(context, {
      command: "legacy review",
      summary: `Legacy candidate ${candidateId} was not found.`,
      errors: [
        {
          code: "legacy-candidate-not-found",
          message: `Legacy candidate ${candidateId} was not found.`
        }
      ],
      next_steps: ["Run board legacy list to find a candidate id."]
    });
  }

  return buildSuccessResult(context, {
    command: "legacy review",
    summary: `Updated ${candidate.id} to ${candidate.status}.`,
    data: {
      legacy: {
        candidate
      }
    },
    candidate_findings: [candidateFinding(candidate)]
  });
}

async function loadLegacyStore(
  context: CommandContext,
  command: string
): Promise<
  | {
      readonly ok: true;
      readonly store: ReturnType<typeof createLegacyCandidateStore>;
    }
  | {
      readonly ok: false;
      readonly result: CommandResult;
    }
> {
  const repositoryRoot = await context.repositoryRoot();

  if (!repositoryRoot.ok) {
    return {
      ok: false,
      result: buildFailureResult(context, {
        command,
        summary: repositoryRoot.message,
        errors: [{ code: repositoryRoot.reason, message: repositoryRoot.message }],
        next_steps: ["Run this command from a Git repository or pass --cwd."]
      })
    };
  }

  const localState = await context.localState();

  if (localState.repositoryStateRoot === undefined) {
    return {
      ok: false,
      result: buildFailureResult(context, {
        command,
        summary: "Repository local state is unavailable.",
        errors: [
          {
            code: "local-state-unavailable",
            message: "Repository local state is unavailable."
          }
        ],
        next_steps: ["Run this command from a Git repository."]
      })
    };
  }

  const stateStore = createJsonDoctorStateStore(
    resolveDoctorStateStorePaths({
      repositoryStateRoot: localState.repositoryStateRoot
    })
  );
  await stateStore.ensure();

  return {
    ok: true,
    store: createLegacyCandidateStore({ stateStore })
  };
}

function filterCandidates(
  candidates: readonly LegacyCandidateRecord[],
  options: LegacyListCommandOptions
): readonly LegacyCandidateRecord[] {
  return candidates.filter(
    (candidate) =>
      (options.status === undefined || candidate.status === options.status) &&
      (options.confidence === undefined || candidate.confidence === options.confidence)
  );
}

function normalizeReviewStatus(status: string | undefined): LegacyReviewStatus {
  if (status === undefined) {
    throw usageError("Missing required --status for legacy review.", [
      `Use one of: ${legacyReviewStatuses.join(", ")}.`
    ]);
  }

  if (!(legacyReviewStatuses as readonly string[]).includes(status)) {
    throw usageError(`Invalid legacy review status: ${status}`, [
      `Use one of: ${legacyReviewStatuses.join(", ")}.`
    ]);
  }

  return status as LegacyReviewStatus;
}

function formatCandidateList(
  summary: string,
  candidates: readonly LegacyCandidateRecord[]
): string {
  return [
    summary,
    ...candidates.map(
      (candidate) =>
        `  ${candidate.id} [${candidate.status}] ${candidate.target.kind}: ${candidate.target.value}`
    )
  ].join("\n");
}

function formatCandidateExplanation(candidate: LegacyCandidateRecord): string {
  return [
    `${candidate.id} [${candidate.status}] ${candidate.target.kind}: ${candidate.target.value}`,
    `Confidence: ${candidate.confidence}`,
    `Action: ${candidate.suggestedReviewAction}`,
    ...candidate.evidence.map((evidence) => `Evidence: ${evidence.summary}`),
    ...candidate.counterEvidence.map((evidence) => `Caveat: ${evidence.summary}`),
    ...candidate.replacementHints.map((hint) => `Replacement: ${hint}`)
  ].join("\n");
}

function candidateFinding(candidate: LegacyCandidateRecord) {
  return {
    id: candidate.id,
    kind: "legacy" as const,
    title: `${candidate.target.kind}: ${candidate.target.value}`,
    summary: candidate.suggestedReviewAction,
    evidence: candidate.evidence.map((evidence) => evidence.summary)
  };
}
