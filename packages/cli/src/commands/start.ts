import {
  createJsonRuntimeStateStore,
  formatStartRuntimeReport,
  resolveRuntimeStateStorePaths,
  startRuntime
} from "@repo-knowledge/bootstrap-runtime";

import type { CommandContext } from "../command-context.js";
import { ensureLocalStateDirectories } from "../config/local-state.js";
import {
  contractInvalidError,
  contractNotFoundError,
  permissionOrAccessError,
  repositoryNotFoundError
} from "../errors/board-error.js";
import { buildFailureResult, buildSuccessResult, type CommandResult } from "../output/result.js";

export type StartCommandOptions = {
  readonly dryRun?: boolean;
  readonly skipSetup?: boolean;
  readonly only?: string;
  readonly healthCheck?: boolean;
  readonly timeout?: number;
  readonly interruptSignal?: AbortSignal;
};

export async function startCommand(
  context: CommandContext,
  options: StartCommandOptions
): Promise<CommandResult> {
  const [repositoryRoot, contractLoad, localState] = await Promise.all([
    context.repositoryRoot(),
    context.contract(),
    context.localState()
  ]);

  if (!repositoryRoot.ok) {
    throw repositoryNotFoundError(repositoryRoot.message);
  }

  if (!contractLoad.ok) {
    throw contractLoadError(contractLoad);
  }

  const ensuredLocalState = await ensureLocalStateDirectories(localState);

  if (ensuredLocalState.repositoryStateRoot === undefined) {
    throw repositoryNotFoundError("Repository local state root could not be resolved.");
  }

  const runtimeResult = await startRuntime({
    repositoryRoot: repositoryRoot.root,
    contract: contractLoad.contract,
    contractPath: contractLoad.path,
    dryRun: options.dryRun ?? false,
    skipSetup: options.skipSetup,
    only: options.only,
    healthChecks: options.healthCheck,
    timeoutSeconds: options.timeout,
    interruptSignal: options.interruptSignal,
    sessionId: context.sessionId,
    stateStore: createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: ensuredLocalState.repositoryStateRoot
      })
    ),
    env: context.env
  });
  const runtimeReport = formatStartRuntimeReport(runtimeResult);

  const resultInput = {
    command: "start",
    summary: runtimeReport.summary,
    data: {
      runtime: {
        status: runtimeResult.status,
        plan: runtimeResult.plan,
        session: runtimeResult.session,
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
      root: repositoryRoot.root,
      name: contractLoad.contract.repository.name
    },
    contract: {
      path: contractLoad.path,
      valid: true
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

function contractLoadError(contractLoad: {
  readonly reason:
    "repository-not-found" | "contract-not-found" | "contract-invalid" | "read-error";
  readonly message: string;
  readonly path?: string;
  readonly issues: readonly unknown[];
  readonly nextSteps: readonly string[];
}) {
  switch (contractLoad.reason) {
    case "repository-not-found":
      return repositoryNotFoundError(contractLoad.message, contractLoad.nextSteps);
    case "contract-not-found":
      return contractNotFoundError(contractLoad.message, contractLoad.path, contractLoad.nextSteps);
    case "contract-invalid":
      return contractInvalidError(
        contractLoad.message,
        contractLoad.path,
        contractLoad.issues,
        contractLoad.nextSteps
      );
    case "read-error":
      return permissionOrAccessError(contractLoad.message, contractLoad.path);
  }
}
