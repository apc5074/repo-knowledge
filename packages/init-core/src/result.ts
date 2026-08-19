import type { RepositoryContract } from "@repo-knowledge/repository-contract";
import type { RepositoryScanResult } from "@repo-knowledge/scanner-core";

export const initApprovalStatuses = [
  "proposed",
  "approval-required",
  "approved",
  "rejected",
  "applied"
] as const;

export type InitApprovalStatus = (typeof initApprovalStatuses)[number];

export type InitReviewItem = {
  readonly id: string;
  readonly kind: "missing-evidence" | "low-confidence" | "confirmation-required" | "conflict";
  readonly title: string;
  readonly summary: string;
  readonly evidence?: readonly string[];
};

export type InitArtifactProposal = {
  readonly path: string;
  readonly action: "create" | "update" | "skip" | "unchanged" | "deferred";
  readonly proposalId?: string;
  readonly approvalRequired?: boolean;
  readonly proposedBy?: string;
  readonly content?: string;
  readonly reason?: string;
  readonly warnings?: readonly string[];
  readonly diff?: string;
  /** @deprecated use approvalRequired */
  readonly requiresApproval?: boolean;
};

export type InitWorkflowStep = {
  readonly id: string;
  readonly title: string;
  readonly status: "completed" | "pending" | "skipped";
  readonly summary: string;
};

export type InitValidationResult = {
  readonly ok: boolean;
  readonly issues: readonly string[];
};

export type InitProposalSummary = {
  readonly factsRead: number;
  readonly artifactsProposed: number;
  readonly filesToCreate: number;
  readonly filesToUpdate: number;
  readonly reviewItems: number;
};

export type InitWorktreeStatus = {
  readonly isGitRepository: boolean;
  readonly dirty: boolean;
  readonly modifiedFiles: readonly string[];
  readonly untrackedFiles: readonly string[];
  readonly targetFiles: readonly string[];
  readonly dirtyTargetFiles: readonly string[];
};

export type InitScriptProposal = {
  readonly id: string;
  readonly capability: string;
  readonly target: string;
  readonly suggestedName: string;
  readonly suggestedCommand?: string;
  readonly rationale: string;
  readonly evidence: readonly string[];
  readonly reviewRequired: boolean;
};

export type InitLocalDevelopmentAssumption = {
  readonly id: string;
  readonly subject: string;
  readonly value: string;
  readonly confidence: "low" | "medium" | "high";
  readonly source: "scanner" | "contract";
  readonly reviewRequired: boolean;
  readonly evidence: readonly string[];
};

export type InitializeRepositoryResult = {
  readonly ok: boolean;
  readonly mode: "dry-run" | "write";
  readonly repositoryRoot: string;
  readonly proposalId: string;
  readonly approvalRequired: boolean;
  readonly approvalStatus: InitApprovalStatus;
  readonly scan: RepositoryScanResult;
  readonly proposal: InitProposalSummary;
  readonly proposedContract?: RepositoryContract;
  readonly artifacts: readonly InitArtifactProposal[];
  readonly filesToCreate: readonly string[];
  readonly filesToUpdate: readonly string[];
  readonly filesWritten: readonly string[];
  readonly filesSkipped: readonly string[];
  readonly reviewItems: readonly InitReviewItem[];
  readonly inferredFields: readonly string[];
  readonly unconfirmedFields: readonly string[];
  readonly validation: InitValidationResult;
  readonly warnings: readonly string[];
  readonly nextSteps: readonly string[];
  readonly workflowSteps: readonly InitWorkflowStep[];
  readonly worktree?: InitWorktreeStatus;
  readonly scriptProposals: readonly InitScriptProposal[];
  readonly localDevelopmentAssumptions: readonly InitLocalDevelopmentAssumption[];
  readonly agentRunId?: string;
  readonly toolCallId?: string;
};

export type BuildInitializeRepositoryResultInput = Omit<
  InitializeRepositoryResult,
  "ok" | "proposal"
> & {
  readonly ok?: boolean;
  readonly proposal?: InitProposalSummary;
};

export function buildInitializeRepositoryResult(
  input: BuildInitializeRepositoryResultInput
): InitializeRepositoryResult {
  const proposal =
    input.proposal ??
    createInitProposalSummary({
      factsRead: input.scan.facts.length,
      artifacts: input.artifacts,
      filesToCreate: input.filesToCreate,
      filesToUpdate: input.filesToUpdate,
      reviewItems: input.reviewItems
    });

  return {
    ...input,
    ok: input.ok ?? input.validation.ok,
    proposal
  };
}

export function createInitProposalSummary(input: {
  readonly factsRead: number;
  readonly artifacts: readonly InitArtifactProposal[];
  readonly filesToCreate: readonly string[];
  readonly filesToUpdate: readonly string[];
  readonly reviewItems: readonly InitReviewItem[];
}): InitProposalSummary {
  return {
    factsRead: input.factsRead,
    artifactsProposed: input.artifacts.length,
    filesToCreate: input.filesToCreate.length,
    filesToUpdate: input.filesToUpdate.length,
    reviewItems: input.reviewItems.length
  };
}

export function summarizeInitializeRepositoryResult(result: InitializeRepositoryResult): string {
  const action =
    result.mode === "write"
      ? `${result.filesWritten.length} files written`
      : `${result.filesToCreate.length + result.filesToUpdate.length} files proposed`;

  return [
    `Initialized proposal ${result.proposalId}`,
    action,
    `${result.scan.facts.length} scanner facts`,
    `${result.reviewItems.length} review items`
  ].join("; ");
}
