import type { InitArtifactProposal } from "./result.js";

export type BuildInitArtifactProposalsInput = {
  readonly proposalId: string;
  readonly contractContent: string;
  readonly existingContractContent?: string;
  readonly existingContractInvalid?: boolean;
  readonly contractPath?: string;
};

export function buildInitArtifactProposals(
  input: BuildInitArtifactProposalsInput
): readonly InitArtifactProposal[] {
  const contractPath = input.contractPath ?? ".board/repository.yaml";
  const boardDirectory = parentDirectory(contractPath) ?? ".board";
  const generatedContractPath = generatedSidecarPath(contractPath);
  const contractAction = contractArtifactAction(input);

  return [
    {
      path: boardDirectory,
      action: "create",
      proposalId: input.proposalId,
      approvalRequired: true,
      proposedBy: "contract-agent",
      reason: "Create the repository-local Board metadata directory if it does not already exist."
    },
    {
      path: contractPath,
      action: contractAction,
      proposalId: input.proposalId,
      approvalRequired: contractAction !== "unchanged",
      proposedBy: "contract-agent",
      content:
        contractAction === "create" || contractAction === "update"
          ? input.contractContent
          : undefined,
      reason: contractReason(contractAction, input.existingContractInvalid),
      warnings: input.existingContractInvalid
        ? ["Existing contract is invalid; generated contract is proposed separately for review."]
        : []
    },
    ...(input.existingContractInvalid
      ? [
          {
            path: generatedContractPath,
            action: "create" as const,
            proposalId: input.proposalId,
            approvalRequired: true,
            proposedBy: "contract-agent",
            content: input.contractContent,
            reason:
              "Create a sidecar generated contract for review without overwriting the invalid existing contract.",
            warnings: [`Review this draft before replacing or repairing ${contractPath}.`] as const
          }
        ]
      : []),
    {
      path: "AGENTS.md",
      action: "deferred",
      proposalId: input.proposalId,
      approvalRequired: false,
      proposedBy: "contract-agent",
      reason: "Agent instructions are deferred to a later documentation and skills phase."
    },
    {
      path: "docs/",
      action: "deferred",
      proposalId: input.proposalId,
      approvalRequired: false,
      proposedBy: "contract-agent",
      reason: "Generated repository documentation is deferred to a later phase."
    },
    {
      path: ".board/skills/",
      action: "deferred",
      proposalId: input.proposalId,
      approvalRequired: false,
      proposedBy: "contract-agent",
      reason: "Repo-local skills are deferred until the skills generation phase."
    }
  ];
}

export function artifactPathsByAction(
  artifacts: readonly InitArtifactProposal[],
  action: InitArtifactProposal["action"]
): readonly string[] {
  return artifacts
    .filter((artifact) => artifact.action === action)
    .map((artifact) => artifact.path)
    .sort();
}

function contractArtifactAction(
  input: BuildInitArtifactProposalsInput
): InitArtifactProposal["action"] {
  if (input.existingContractInvalid) {
    return "skip";
  }

  if (input.existingContractContent === undefined) {
    return "create";
  }

  return normalizeText(input.existingContractContent) === normalizeText(input.contractContent)
    ? "unchanged"
    : "update";
}

function contractReason(
  action: InitArtifactProposal["action"],
  existingContractInvalid: boolean | undefined
): string {
  if (existingContractInvalid) {
    return "Existing contract is invalid, so init will not propose overwriting it in this phase.";
  }

  if (action === "create") {
    return "Create the initial repository contract proposal.";
  }

  if (action === "update") {
    return "Update the repository contract proposal while preserving maintainer-authored fields.";
  }

  if (action === "unchanged") {
    return "Existing repository contract already matches the generated proposal.";
  }

  return "No repository contract write is proposed.";
}

function parentDirectory(path: string): string | undefined {
  const index = path.lastIndexOf("/");
  return index === -1 ? undefined : path.slice(0, index);
}

function generatedSidecarPath(contractPath: string): string {
  if (contractPath.endsWith(".yaml")) {
    return `${contractPath.slice(0, -".yaml".length)}.generated.yaml`;
  }

  if (contractPath.endsWith(".yml")) {
    return `${contractPath.slice(0, -".yml".length)}.generated.yml`;
  }

  return `${contractPath}.generated`;
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trimEnd();
}
