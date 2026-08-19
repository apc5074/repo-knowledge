import { resolve } from "node:path";

import {
  buildInitializeRepositoryReview,
  formatInitializeRepositoryReview,
  initializeRepository,
  type InitializeRepositoryResult,
  type InitializeRepositoryReviewOutput
} from "@repo-knowledge/init-core";

import type { CommandContext } from "../command-context.js";
import { buildCommandResult, buildSuccessResult, type CommandResult } from "../output/result.js";

export type InitCommandOptions = {
  readonly dryRun?: boolean;
  readonly write?: boolean;
  readonly force?: boolean;
  readonly includeUntracked?: boolean;
  readonly skipScripts?: boolean;
  readonly contract?: string;
};

export type InitCommandData = {
  readonly init: InitializeRepositoryResult;
  readonly review: InitializeRepositoryReviewOutput;
};

export async function initCommand(
  context: CommandContext,
  options: InitCommandOptions = {}
): Promise<CommandResult<InitCommandData | undefined>> {
  if (options.dryRun === true && options.write === true) {
    return buildCommandResult<undefined>({
      ok: false,
      command: "init",
      summary: "Choose either --dry-run or --write, not both.",
      errors: [
        {
          code: "usage-error",
          message: "Choose either --dry-run or --write, not both."
        }
      ],
      next_steps: ["Run board init --dry-run to review changes before applying them."],
      session_id: context.sessionId,
      agent_run_id: context.agent.agentRunId,
      tool_call_id: context.agent.toolCallId
    });
  }

  const targetRoot = await resolveInitRoot(context);

  if (!targetRoot.ok) {
    return buildCommandResult<undefined>({
      ok: false,
      command: "init",
      summary: "Repository root not found.",
      errors: [
        {
          code: "repository-not-found",
          message: targetRoot.message
        }
      ],
      next_steps: ["Run board init from a Git repository or pass --cwd to a repository path."],
      session_id: context.sessionId,
      agent_run_id: context.agent.agentRunId,
      tool_call_id: context.agent.toolCallId
    });
  }

  const init = await initializeRepository({
    root: targetRoot.root,
    mode: options.write === true ? "write" : "dry-run",
    force: options.force,
    includeUntracked: options.includeUntracked,
    skipScripts: options.skipScripts,
    contractPath: options.contract ?? context.globalFlags.config,
    agent: context.agent
  });
  const review = buildInitializeRepositoryReview(init);

  return buildSuccessResult(context, {
    command: "init",
    status: init.warnings.length > 0 || !init.validation.ok ? "warning" : "success",
    summary: formatInitializeRepositoryReview(init),
    data: {
      init,
      review
    },
    warnings: init.warnings,
    errors: init.validation.issues.map((issue) => ({
      code: "init-validation-issue",
      message: issue
    })),
    next_steps: init.nextSteps,
    repository: {
      root: init.repositoryRoot,
      name: init.proposedContract?.repository.name
    },
    contract: {
      path: options.contract ?? context.globalFlags.config ?? ".board/repository.yaml",
      valid: init.validation.ok
    },
    approval_required: init.approvalRequired,
    proposal_id: init.proposalId,
    review_items: init.reviewItems.map((item) => ({
      id: item.id,
      title: item.title,
      status: "proposal",
      evidence: item.evidence
    }))
  });
}

async function resolveInitRoot(
  context: CommandContext
): Promise<
  { readonly ok: true; readonly root: string } | { readonly ok: false; readonly message: string }
> {
  if (context.globalFlags.cwd) {
    return {
      ok: true,
      root: resolve(context.currentWorkingDirectory, context.globalFlags.cwd)
    };
  }

  const repositoryRoot = await context.repositoryRoot();

  if (!repositoryRoot.ok) {
    return {
      ok: false,
      message: repositoryRoot.message
    };
  }

  return {
    ok: true,
    root: repositoryRoot.root
  };
}
