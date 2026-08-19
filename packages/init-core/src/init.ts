import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  normalizeScanResult,
  scanRepository
} from "@repo-knowledge/scanner-core";

import { artifactPathsByAction, buildInitArtifactProposals } from "./artifact.js";
import { generateLocalDevelopmentAssumptions } from "./assumptions.js";
import { attachArtifactDiffs } from "./diff.js";
import {
  normalizeInitializeRepositoryOptions,
  type InitializeRepositoryOptions
} from "./options.js";
import { buildContractProposal } from "./proposal.js";
import { buildInitializeRepositoryResult, type InitializeRepositoryResult } from "./result.js";
import { detectMissingDevelopmentScripts } from "./script-gaps.js";
import { generateScriptProposals } from "./script-proposals.js";
import { serializeContractForInit } from "./serialization.js";
import { getWorktreeStatus, worktreeWarnings } from "./worktree.js";
import { writeArtifactProposals } from "./writer.js";

export async function initializeRepository(
  input: InitializeRepositoryOptions
): Promise<InitializeRepositoryResult> {
  const options = normalizeInitializeRepositoryOptions(input);
  const repositoryRoot = resolve(options.root);
  const scan = normalizeScanResult(
    await scanRepository({
      root: repositoryRoot,
      detectors: createDefaultRepositoryDetectors(),
      agent_run_id: options.agent?.agentRunId,
      tool_call_id: options.agent?.toolCallId,
      ...(options.includeUntracked
        ? {
            inventory: await buildFileInventory({
              root: repositoryRoot,
              includeUntracked: true
            })
          }
        : {})
    })
  );
  const existingContract = await readExistingContract(repositoryRoot, options.contractPath);
  const proposal = buildContractProposal({
    repositoryRoot,
    scan,
    existingContract
  });
  const proposalId = createProposalId(repositoryRoot);
  const serialized = serializeContractForInit(proposal.contract);
  const contractPath = options.contractPath ?? ".board/repository.yaml";
  const artifacts = attachArtifactDiffs({
    artifacts: buildInitArtifactProposals({
      proposalId,
      contractPath,
      contractContent: serialized.content,
      existingContractContent: existingContract?.content,
      existingContractInvalid: proposal.existingContractInvalid
    }),
    existingContentByPath: {
      [contractPath]: existingContract?.content
    }
  });
  const filesToCreate = artifactPathsByAction(artifacts, "create").filter(
    (path) => path !== ".board"
  );
  const filesToUpdate = artifactPathsByAction(artifacts, "update");
  const dryRunFilesSkipped = artifactPathsByAction(artifacts, "skip");
  const scriptGaps = detectMissingDevelopmentScripts(scan.facts);
  const scriptProposals = generateScriptProposals({
    gaps: scriptGaps.gaps,
    facts: scan.facts
  });
  const assumptions = generateLocalDevelopmentAssumptions({
    facts: scan.facts,
    contract: proposal.contract
  });
  const worktree = await getWorktreeStatus({
    repositoryRoot,
    targetFiles: [...filesToCreate, ...filesToUpdate]
  });
  const dirtyTargetWriteBlocked =
    options.mode === "write" && worktree.dirtyTargetFiles.length > 0 && !options.force;
  const canWrite = proposal.validation.ok && serialized.validation.ok && !dirtyTargetWriteBlocked;
  const writeResult =
    options.mode === "write" && canWrite
      ? await writeArtifactProposals({
          repositoryRoot,
          artifacts,
          force: options.force
        })
      : undefined;

  return buildInitializeRepositoryResult({
    ok: proposal.validation.ok && serialized.validation.ok,
    mode: options.mode,
    repositoryRoot,
    proposalId,
    approvalRequired: true,
    approvalStatus: "approval-required",
    scan,
    proposedContract: proposal.contract,
    artifacts,
    filesToCreate,
    filesToUpdate,
    filesWritten: writeResult?.written ?? [],
    filesSkipped: writeResult?.skipped ?? dryRunFilesSkipped,
    reviewItems: [...proposal.reviewItems, ...scriptGaps.reviewItems],
    inferredFields: [
      ...proposal.inferredFields,
      ...scriptGaps.inferredFields,
      ...scriptProposals.inferredFields,
      ...assumptions.inferredFields
    ],
    unconfirmedFields: [...proposal.unconfirmedFields, ...assumptions.unconfirmedFields],
    validation: {
      ok: proposal.validation.ok && serialized.validation.ok,
      issues: [...proposal.validation.issues, ...serialized.validation.issues]
    },
    warnings: [
      ...scan.warnings.map((warning) =>
        warning.path ? `${warning.path}: ${warning.message}` : warning.message
      ),
      ...proposal.warnings,
      ...worktreeWarnings(worktree)
    ],
    nextSteps: initNextSteps({
      mode: options.mode,
      existingContractInvalid: proposal.existingContractInvalid,
      writeResultApplied: writeResult !== undefined
    }),
    workflowSteps: [
      {
        id: "scan-repository",
        title: "Scan repository",
        status: "completed",
        summary: `Detected ${scan.facts.length} facts from ${scan.stats.files_in_inventory} files.`
      },
      {
        id: "build-contract-proposal",
        title: "Build contract proposal",
        status: "completed",
        summary: proposal.summary
      },
      {
        id: "apply-artifact-proposal",
        title: "Apply artifact proposal",
        status:
          options.mode === "write" && writeResult !== undefined
            ? "completed"
            : options.mode === "write"
              ? "skipped"
              : "pending",
        summary:
          options.mode === "write" && writeResult !== undefined
            ? `Wrote ${writeResult.written.length} artifacts and skipped ${writeResult.skipped.length}.`
            : dirtyTargetWriteBlocked
              ? "Skipped writes because target files are dirty and force was not set."
              : options.mode === "write"
                ? "Skipped writes because the proposal did not validate."
                : "Dry-run mode did not write files."
      }
    ],
    worktree,
    scriptProposals: scriptProposals.proposals,
    localDevelopmentAssumptions: assumptions.assumptions,
    agentRunId: options.agent?.agentRunId,
    toolCallId: options.agent?.toolCallId
  });
}

function initNextSteps(input: {
  readonly mode: "dry-run" | "write";
  readonly existingContractInvalid: boolean;
  readonly writeResultApplied: boolean;
}): readonly string[] {
  if (input.existingContractInvalid) {
    return input.mode === "write" && input.writeResultApplied
      ? [
          "Repair .board/repository.yaml before treating the repository contract as valid.",
          "Review the written .board/repository.generated.yaml draft before replacing the invalid contract."
        ]
      : [
          "Repair .board/repository.yaml before treating the repository contract as valid.",
          "Review the .board/repository.generated.yaml proposal as a fresh generated draft."
        ];
  }

  return input.mode === "write" && input.writeResultApplied
    ? ["Review and commit the written .board/repository.yaml artifact."]
    : ["Review the proposed repository contract before applying it to disk."];
}

async function readExistingContract(
  repositoryRoot: string,
  contractPath: string | undefined
): Promise<{ path: string; content: string } | undefined> {
  const path = resolve(repositoryRoot, contractPath ?? ".board/repository.yaml");

  try {
    await access(path);
  } catch {
    return undefined;
  }

  return {
    path,
    content: await readFile(path, "utf8")
  };
}

function createProposalId(repositoryRoot: string): string {
  let hash = 2_166_136_261;

  for (const character of repositoryRoot) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return `proposal-local-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
