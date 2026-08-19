import type {
  InitArtifactProposal,
  InitializeRepositoryResult,
  InitLocalDevelopmentAssumption,
  InitReviewItem,
  InitScriptProposal
} from "./result.js";

export type InitReviewFact = {
  readonly id: string;
  readonly kind: string;
  readonly confidence: string;
  readonly value: string;
};

export type InitReviewArtifact = {
  readonly path: string;
  readonly action: InitArtifactProposal["action"];
  readonly approvalRequired: boolean;
  readonly reason?: string;
  readonly warnings: readonly string[];
  readonly hasDiff: boolean;
};

export type InitReviewApprovalItem = {
  readonly id: string;
  readonly kind: "review-item" | "script-proposal" | "local-development-assumption";
  readonly title: string;
  readonly summary: string;
  readonly evidence: readonly string[];
};

export type InitializeRepositoryReviewOutput = {
  readonly proposalId: string;
  readonly mode: InitializeRepositoryResult["mode"];
  readonly approvalStatus: InitializeRepositoryResult["approvalStatus"];
  readonly approvalRequired: boolean;
  readonly repository: {
    readonly root: string;
    readonly name?: string;
    readonly type?: string;
    readonly primaryLanguage?: string;
  };
  readonly scanSummary: {
    readonly filesRead: number;
    readonly factsRead: number;
    readonly warnings: number;
    readonly errors: number;
  };
  readonly proposedFiles: readonly InitReviewArtifact[];
  readonly filesWritten: readonly string[];
  readonly discoveredFacts: readonly InitReviewFact[];
  readonly inferredFields: readonly string[];
  readonly unconfirmedFields: readonly string[];
  readonly approvalRequiredItems: readonly InitReviewApprovalItem[];
  readonly reviewItems: readonly InitReviewItem[];
  readonly scriptProposals: readonly InitScriptProposal[];
  readonly localDevelopmentAssumptions: readonly InitLocalDevelopmentAssumption[];
  readonly knownLimitations: readonly unknown[];
  readonly validation: InitializeRepositoryResult["validation"];
  readonly workflowSteps: InitializeRepositoryResult["workflowSteps"];
  readonly warnings: readonly string[];
  readonly nextSteps: readonly string[];
};

export function buildInitializeRepositoryReview(
  result: InitializeRepositoryResult
): InitializeRepositoryReviewOutput {
  return {
    proposalId: result.proposalId,
    mode: result.mode,
    approvalStatus: result.approvalStatus,
    approvalRequired: result.approvalRequired,
    repository: {
      root: result.repositoryRoot,
      name: result.proposedContract?.repository.name,
      type: result.proposedContract?.repository.type,
      primaryLanguage: result.proposedContract?.repository.primary_language
    },
    scanSummary: {
      filesRead: result.scan.stats.files_in_inventory,
      factsRead: result.scan.facts.length,
      warnings: result.scan.warnings.length,
      errors: result.scan.errors.length
    },
    proposedFiles: result.artifacts.map((artifact) => ({
      path: artifact.path,
      action: artifact.action,
      approvalRequired: artifact.approvalRequired === true || artifact.requiresApproval === true,
      reason: artifact.reason,
      warnings: artifact.warnings ?? [],
      hasDiff: artifact.diff !== undefined && artifact.diff.length > 0
    })),
    filesWritten: result.filesWritten,
    discoveredFacts: result.scan.facts.slice(0, 20).map((fact) => ({
      id: fact.id,
      kind: fact.kind,
      confidence: fact.confidence,
      value: summarizeFactValue(fact.value)
    })),
    inferredFields: result.inferredFields,
    unconfirmedFields: result.unconfirmedFields,
    approvalRequiredItems: [
      ...result.reviewItems.map((item) => ({
        id: item.id,
        kind: "review-item" as const,
        title: item.title,
        summary: item.summary,
        evidence: item.evidence ?? []
      })),
      ...result.scriptProposals
        .filter((proposal) => proposal.reviewRequired)
        .map((proposal) => ({
          id: proposal.id,
          kind: "script-proposal" as const,
          title: `Review script proposal: ${proposal.suggestedName}`,
          summary: proposal.rationale,
          evidence: proposal.evidence
        })),
      ...result.localDevelopmentAssumptions
        .filter((assumption) => assumption.reviewRequired)
        .map((assumption) => ({
          id: assumption.id,
          kind: "local-development-assumption" as const,
          title: `Confirm ${assumption.subject}`,
          summary: assumption.value,
          evidence: assumption.evidence
        }))
    ],
    reviewItems: result.reviewItems,
    scriptProposals: result.scriptProposals,
    localDevelopmentAssumptions: result.localDevelopmentAssumptions,
    knownLimitations: result.proposedContract?.known_limitations ?? [],
    validation: result.validation,
    workflowSteps: result.workflowSteps,
    warnings: result.warnings,
    nextSteps: result.nextSteps
  };
}

export function formatInitializeRepositoryReview(result: InitializeRepositoryResult): string {
  const review = buildInitializeRepositoryReview(result);
  const repositoryName = review.repository.name ?? review.repository.root;
  const lines = [
    `board init ${result.mode === "write" && result.filesWritten.length > 0 ? "applied" : "proposal"} ${review.proposalId}`,
    `Repository: ${repositoryName}`,
    `Scan: ${review.scanSummary.factsRead} facts from ${review.scanSummary.filesRead} files`,
    `Artifacts: ${review.proposedFiles.length} proposed, ${result.filesToCreate.length} create, ${result.filesToUpdate.length} update, ${result.filesWritten.length} written`,
    `Approval: ${review.approvalStatus}${review.approvalRequired ? " (required)" : ""}`,
    `Validation: ${review.validation.ok ? "passed" : `failed (${review.validation.issues.length} issues)`}`
  ];

  appendList(
    lines,
    "Proposed files",
    review.proposedFiles.map(
      (artifact) =>
        `${artifact.action} ${artifact.path}${artifact.approvalRequired ? " [approval]" : ""}`
    )
  );
  appendList(
    lines,
    "Key discovered facts",
    review.discoveredFacts.slice(0, 8).map((fact) => `${fact.kind}: ${fact.value}`)
  );
  appendList(lines, "Inferred fields", review.inferredFields.slice(0, 12));
  appendList(
    lines,
    "Needs review",
    approvalItemSummaries(review.approvalRequiredItems).slice(0, 12)
  );
  appendList(
    lines,
    "Script proposals",
    review.scriptProposals
      .slice(0, 8)
      .map(
        (proposal) =>
          `${proposal.suggestedName}: ${proposal.suggestedCommand ?? "command needs confirmation"}`
      )
  );
  appendList(
    lines,
    "Local assumptions",
    review.localDevelopmentAssumptions
      .slice(0, 8)
      .map((assumption) => `${assumption.subject}: ${assumption.value}`)
  );
  appendList(lines, "Known limitations", review.knownLimitations.map(summarizeFactValue));
  appendList(
    lines,
    "Workflow",
    review.workflowSteps.map((step) => `${step.status} ${step.title}: ${step.summary}`)
  );

  const diffBlocks = result.artifacts
    .filter((artifact) => artifact.diff !== undefined && artifact.diff.length > 0)
    .slice(0, 3)
    .map((artifact) => `Diff ${artifact.path}\n${limitLines(artifact.diff ?? "", 80)}`);

  if (diffBlocks.length > 0) {
    lines.push(...diffBlocks);
  }

  return lines.join("\n");
}

function appendList(lines: string[], title: string, items: readonly string[]): void {
  if (items.length === 0) {
    return;
  }

  lines.push(`${title}:`);
  lines.push(...items.map((item) => `- ${item}`));
}

function approvalItemSummaries(items: readonly InitReviewApprovalItem[]): readonly string[] {
  return items.map((item) => `${item.title}: ${item.summary}`);
}

function summarizeFactValue(value: unknown): string {
  if (typeof value === "string") {
    return truncate(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }

  try {
    return truncate(JSON.stringify(value));
  } catch {
    return "[unserializable]";
  }
}

function truncate(value: string): string {
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

function limitLines(value: string, maxLines: number): string {
  const lines = value.split("\n");

  if (lines.length <= maxLines) {
    return value.trimEnd();
  }

  return `${lines.slice(0, maxLines).join("\n")}\n... ${lines.length - maxLines} more lines`;
}
