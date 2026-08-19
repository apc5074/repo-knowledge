import { resolve } from "node:path";

import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  normalizeScanResult,
  scanRepository,
  type RepositoryScanResult
} from "@repo-knowledge/scanner-core";

import type { CommandContext } from "../command-context.js";
import { buildCommandResult, buildSuccessResult, type CommandResult } from "../output/result.js";

export type ScanCommandOptions = {
  readonly includeUntracked?: boolean;
};

export type ScanCommandData = {
  readonly scan: RepositoryScanResult;
};

export async function scanCommand(
  context: CommandContext,
  options: ScanCommandOptions = {}
): Promise<CommandResult<ScanCommandData | undefined>> {
  const targetRoot = await resolveScanRoot(context);

  if (!targetRoot.ok) {
    return buildCommandResult<undefined>({
      ok: false,
      command: "scan",
      summary: "Repository root not found.",
      errors: [
        {
          code: "repository-not-found",
          message: targetRoot.message
        }
      ],
      next_steps: ["Run board scan from a Git repository or pass --cwd to a repository path."],
      session_id: context.sessionId,
      agent_run_id: context.agent.agentRunId,
      tool_call_id: context.agent.toolCallId
    });
  }

  const scan = normalizeScanResult(
    await scanRepository({
      root: targetRoot.root,
      detectors: createDefaultRepositoryDetectors(),
      agent_run_id: context.agent.agentRunId,
      tool_call_id: context.agent.toolCallId,
      ...(options.includeUntracked
        ? {
            inventory: await buildFileInventory({
              root: targetRoot.root,
              includeUntracked: true
            })
          }
        : {})
    })
  );
  const status = scan.warnings.length > 0 || scan.errors.length > 0 ? "warning" : "success";

  return buildSuccessResult(context, {
    command: "scan",
    status,
    summary: scanSummary(scan),
    data: {
      scan
    },
    warnings: scan.warnings.map((warning) =>
      warning.path ? `${warning.path}: ${warning.message}` : warning.message
    ),
    errors: scan.errors.map((error) => ({
      code: error.recoverable ? "scan-recoverable-error" : "scan-error",
      message: error.message,
      path: error.path,
      details: {
        detector: error.detector,
        recoverable: error.recoverable
      }
    })),
    repository: {
      root: scan.repository_root
    }
  });
}

async function resolveScanRoot(
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

function scanSummary(scan: RepositoryScanResult): string {
  return [
    `Scanned ${scan.stats.files_in_inventory} files`,
    `${scan.stats.facts_emitted} facts`,
    `${scan.stats.warnings_emitted} warnings`,
    `${scan.stats.errors_emitted} errors`
  ].join("; ");
}
