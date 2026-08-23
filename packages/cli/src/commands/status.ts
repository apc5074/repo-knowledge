import { createRequire } from "node:module";
import { stat } from "node:fs/promises";

import {
  createJsonRuntimeStateStore,
  formatRuntimeStatusReport,
  getRuntimeStatus,
  resolveRuntimeStateStorePaths,
  type RuntimeStatusResult
} from "@repo-knowledge/bootstrap-runtime";

import type { CommandContext } from "../command-context.js";
import { buildSuccessResult, type CommandResult } from "../output/result.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { readonly version: string };

export type StatusCommandOptions = {
  readonly session?: string;
};

export async function statusCommand(
  context: CommandContext,
  options: StatusCommandOptions = {}
): Promise<CommandResult> {
  const [repositoryRoot, contract, localState] = await Promise.all([
    context.repositoryRoot(),
    context.contract(),
    context.localState()
  ]);
  const repositoryFound = repositoryRoot.ok;
  const contractFound = contract.ok || contract.reason !== "contract-not-found";
  const contractValid = contract.ok;
  const runtime = await loadRuntimeStatus({
    repositoryRoot,
    repositoryStateRoot: localState.repositoryStateRoot,
    sessionId: options.session,
    getRuntimeStatus,
    createJsonRuntimeStateStore,
    resolveRuntimeStateStorePaths
  });
  const runtimeReport = runtime === undefined ? undefined : formatRuntimeStatusReport(runtime);
  const summary = buildStatusSummary(
    repositoryFound,
    contractFound,
    contractValid,
    runtimeReport?.summary ?? runtime?.summary
  );
  const nextSteps = !repositoryFound
    ? ["Run board init from the repository root."]
    : !contractFound
      ? ["Run board init to create .board/repository.yaml."]
      : !contract.ok
        ? ["Fix the contract issues above, then run board contract validate again."]
        : (runtime?.nextSteps ?? []);
  const warnings = [
    ...(contract.ok || contract.issues.length === 0
      ? []
      : contract.issues.map((issue) => `${issue.path}: ${issue.message}`)),
    ...(runtime?.warnings ?? [])
  ];
  const status =
    warnings.length > 0 ||
    (runtime !== undefined && runtime.ok === false && runtime.session === undefined)
      ? "warning"
      : "success";

  return buildSuccessResult(context, {
    command: "status",
    summary,
    data: {
      repository: repositoryRoot.ok
        ? {
            found: true,
            root: repositoryRoot.root,
            found_by: repositoryRoot.foundBy
          }
        : {
            found: false,
            reason: repositoryRoot.reason,
            message: repositoryRoot.message
          },
      contract: contract.ok
        ? {
            found: true,
            valid: true,
            path: contract.path,
            repository_name: contract.contract.repository.name
          }
        : {
            found: contractFound,
            valid: false,
            path: contract.path,
            reason: contract.reason,
            message: contract.message,
            issues: contract.issues
          },
      local_state: {
        data_root: localState.dataRoot,
        cache_root: localState.cacheRoot,
        logs_root: localState.logsRoot,
        sessions_root: localState.sessionsRoot,
        repository_state_root: localState.repositoryStateRoot
      },
      cli: {
        version: packageJson.version
      },
      runtime:
        runtime === undefined
          ? {
              available: false,
              summary: "Runtime state is unavailable because no repository root was found."
            }
          : {
              available: true,
              status: runtime.status,
              summary: runtime.summary,
              session: runtime.session,
              resources: runtime.resources,
              report: runtimeReport?.details
            }
    },
    warnings,
    status,
    next_steps: nextSteps,
    repository: repositoryRoot.ok
      ? {
          root: repositoryRoot.root,
          name: contract.ok ? contract.contract.repository.name : undefined
        }
      : undefined,
    contract: contract.ok
      ? {
          path: contract.path,
          valid: true
        }
      : {
          path: contract.path,
          valid: false
        }
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function loadRuntimeStatus(input: {
  readonly repositoryRoot: Awaited<ReturnType<CommandContext["repositoryRoot"]>>;
  readonly repositoryStateRoot: string | undefined;
  readonly sessionId: string | undefined;
  readonly getRuntimeStatus: typeof getRuntimeStatus;
  readonly createJsonRuntimeStateStore: typeof createJsonRuntimeStateStore;
  readonly resolveRuntimeStateStorePaths: typeof resolveRuntimeStateStorePaths;
}): Promise<RuntimeStatusResult | undefined> {
  if (!input.repositoryRoot.ok) {
    return undefined;
  }

  if (input.repositoryStateRoot === undefined || !(await pathExists(input.repositoryStateRoot))) {
    return {
      ok: false,
      status: "unknown",
      summary:
        input.sessionId === undefined
          ? "No runtime session has been recorded for this repository."
          : `Runtime session ${input.sessionId} was not found.`,
      warnings: [],
      errors: [],
      nextSteps: ["Run board start before requesting runtime status."],
      resources: [],
      session: undefined
    };
  }

  return input.getRuntimeStatus({
    repositoryRoot: input.repositoryRoot.root,
    sessionId: input.sessionId,
    stateStore: input.createJsonRuntimeStateStore(
      input.resolveRuntimeStateStorePaths({
        repositoryStateRoot: input.repositoryStateRoot
      })
    )
  });
}

function buildStatusSummary(
  repositoryFound: boolean,
  contractFound: boolean,
  contractValid: boolean,
  runtimeSummary?: string
): string {
  const repositorySummary = !repositoryFound
    ? "Repository not found."
    : !contractFound
      ? "Repository found; contract missing."
      : !contractValid
        ? "Repository found; contract invalid."
        : "Repository found; contract valid.";

  if (runtimeSummary === undefined) {
    return repositorySummary;
  }

  return `${repositorySummary} ${runtimeSummary}`;
}
