import { join } from "node:path";

import {
  formatVerificationRunReport,
  resolveVerificationHistoryStorePaths,
  runVerificationOrchestrator,
  serializeVerificationRunToJson,
  type VerificationOrchestratorResult
} from "@repo-knowledge/verification-runtime";

import type { CommandContext } from "../command-context.js";
import { usageError } from "../errors/board-error.js";
import { buildFailureResult, buildSuccessResult, type CommandResult } from "../output/result.js";

export type VerifyCommandOptions = {
  readonly dryRun?: boolean;
  readonly all?: boolean;
  readonly changed?: boolean;
  readonly since?: string;
  readonly base?: string;
  readonly paths?: readonly string[];
  readonly component?: readonly string[];
  readonly check?: readonly string[];
  readonly skip?: readonly string[];
  readonly noDefault?: boolean;
  readonly timeout?: number;
  readonly json?: boolean;
};

export async function verifyCommand(
  context: CommandContext,
  options: VerifyCommandOptions = {}
): Promise<CommandResult> {
  validateVerifyOptions(options);

  const repositoryRoot = await context.repositoryRoot();
  if (!repositoryRoot.ok) {
    return buildFailureResult(context, {
      command: "verify",
      summary: repositoryRoot.message,
      errors: [{ code: repositoryRoot.reason, message: repositoryRoot.message }],
      next_steps:
        repositoryRoot.reason === "not-found" ? ["Run board init from the repository root."] : []
    });
  }

  const contract = await context.contract();
  if (!contract.ok) {
    return buildFailureResult(context, {
      command: "verify",
      summary: contract.message,
      errors: [{ code: contract.reason, message: contract.message }],
      next_steps:
        contract.reason === "contract-not-found"
          ? ["Run board init to create .board/repository.yaml."]
          : ["Fix the contract issues above, then run board contract validate again."],
      repository: {
        root: repositoryRoot.root
      },
      contract: {
        path: contract.path,
        valid: false
      }
    });
  }

  const localState = await context.localState();
  const orchestratorResult: VerificationOrchestratorResult = await runVerificationOrchestrator({
    repositoryRoot: repositoryRoot.root,
    contractPath: contract.path,
    dryRun: options.dryRun,
    baseRef: options.base,
    sinceRef: options.since,
    all: options.all,
    changed: options.changed,
    requestedPaths: options.paths,
    requestedComponentIds: options.component,
    requestedCheckIds: options.check,
    skippedCheckIds: options.skip,
    noDefault: options.noDefault,
    timeoutSeconds: options.timeout,
    repositoryStateRoot: localState.repositoryStateRoot,
    env: process.env
  });

  if (!orchestratorResult.ok) {
    return buildFailureResult(context, {
      command: "verify",
      summary: orchestratorResult.error ?? "Verification failed.",
      errors: [
        {
          code: "verification-orchestrator-error",
          message: orchestratorResult.error ?? "Verification failed."
        }
      ],
      repository: {
        root: repositoryRoot.root,
        name: contract.contract.repository.name
      },
      contract: {
        path: contract.path,
        valid: false
      }
    });
  }

  const report = formatVerificationRunReport(orchestratorResult.run);
  const historyPaths =
    localState.repositoryStateRoot === undefined
      ? undefined
      : resolveVerificationHistoryStorePaths({
          repositoryStateRoot: localState.repositoryStateRoot
        });
  const data = {
    verification: {
      plan: orchestratorResult.plan,
      run: orchestratorResult.run,
      history:
        historyPaths === undefined
          ? undefined
          : {
              repository_state_root: localState.repositoryStateRoot,
              verification_root: historyPaths.verificationRoot,
              latest_path: historyPaths.latestPath,
              history_path: historyPaths.historyPath,
              run_path: join(historyPaths.runsRoot, `${orchestratorResult.run.runId}.json`)
            },
      report:
        options.json === true
          ? serializeVerificationRunToJson(orchestratorResult.run)
          : report.details
    }
  };

  return orchestratorResult.run.status === "failed"
    ? buildFailureResult(context, {
        command: "verify",
        summary: report.summary,
        data,
        warnings: orchestratorResult.run.warnings,
        errors: orchestratorResult.run.errors.map((error: string) => ({
          code: "verification-check-failed",
          message: error
        })),
        next_steps: orchestratorResult.run.results.some(
          (result: { readonly status: string }) => result.status === "failed"
        )
          ? ["Fix the failed verification checks, then run board verify again."]
          : [],
        repository: {
          root: repositoryRoot.root,
          name: contract.contract.repository.name
        },
        contract: {
          path: contract.path,
          valid: true
        }
      })
    : buildSuccessResult(context, {
        command: "verify",
        summary: report.summary,
        data,
        warnings: orchestratorResult.run.warnings,
        repository: {
          root: repositoryRoot.root,
          name: contract.contract.repository.name
        },
        contract: {
          path: contract.path,
          valid: true
        }
      });
}

function validateVerifyOptions(options: VerifyCommandOptions): void {
  if (options.base !== undefined && options.since !== undefined) {
    throw usageError("Use either --base or --since, not both.", [
      "Choose one git reference for verification change detection."
    ]);
  }

  if (options.all === true && options.changed === true) {
    throw usageError("Use either --all or --changed, not both.", [
      "Choose --all to run every check or --changed to run only change-selected checks."
    ]);
  }
}
