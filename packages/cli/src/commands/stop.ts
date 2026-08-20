import { stat } from "node:fs/promises";

import {
  createJsonRuntimeStateStore,
  formatStopRuntimeReport,
  resolveRuntimeStateStorePaths,
  stopRuntime
} from "../../../bootstrap-runtime/dist/index.js";

import type { CommandContext } from "../command-context.js";
import { ensureLocalStateDirectories } from "../config/local-state.js";
import { repositoryNotFoundError } from "../errors/board-error.js";
import { buildFailureResult, buildSuccessResult, type CommandResult } from "../output/result.js";

export type StopCommandOptions = {
  readonly session?: string;
  readonly all?: boolean;
  readonly force?: boolean;
};

export async function stopCommand(
  context: CommandContext,
  options: StopCommandOptions
): Promise<CommandResult> {
  const [repositoryRoot, localState] = await Promise.all([
    context.repositoryRoot(),
    context.localState()
  ]);

  if (!repositoryRoot.ok) {
    throw repositoryNotFoundError(repositoryRoot.message);
  }

  if (localState.repositoryStateRoot === undefined) {
    throw repositoryNotFoundError("Repository local state root could not be resolved.");
  }

  if (!(await pathExists(localState.repositoryStateRoot))) {
    const missingResult = {
      ok: false,
      status: "unknown",
      summary: "No Board-managed runtime session is available to stop.",
      warnings: [],
      errors: [],
      nextSteps: ["Run board status or board start to create a runtime session first."],
      stoppedSessionIds: [],
      stoppedResources: []
    } as const;
    const missingReport = formatStopRuntimeReport(missingResult);

    return buildFailureResult(context, {
      command: "stop",
      summary: missingReport.summary,
      data: {
        runtime: {
          status: missingResult.status,
          stopped_session_ids: missingResult.stoppedSessionIds,
          stopped_resources: missingResult.stoppedResources,
          report: missingReport.details
        }
      },
      warnings: missingResult.warnings,
      errors: [],
      next_steps: missingResult.nextSteps,
      repository: {
        root: repositoryRoot.root
      },
      status: "failure"
    });
  }

  const ensuredLocalState = await ensureLocalStateDirectories(localState);

  const runtimeResult = await stopRuntime({
    repositoryRoot: repositoryRoot.root,
    sessionId: options.session,
    all: options.all,
    force: options.force,
    stateStore: createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: ensuredLocalState.repositoryStateRoot as string
      })
    )
  });
  const runtimeReport = formatStopRuntimeReport(runtimeResult);

  const resultInput = {
    command: "stop",
    summary: runtimeReport.summary,
    data: {
      runtime: {
        status: runtimeResult.status,
        stopped_session_ids: runtimeResult.stoppedSessionIds,
        stopped_resources: runtimeResult.stoppedResources,
        report: runtimeReport.details
      }
    },
    warnings: runtimeResult.warnings,
    errors: runtimeResult.errors.map((error) => ({
      code: "external-command-failed",
      message: error
    })),
    next_steps: runtimeResult.nextSteps,
    repository: {
      root: repositoryRoot.root
    },
    status: runtimeResult.ok
      ? runtimeResult.warnings.length > 0
        ? "warning"
        : "success"
      : "failure"
  } as const;

  return runtimeResult.ok
    ? buildSuccessResult(context, resultInput)
    : buildFailureResult(context, resultInput);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
