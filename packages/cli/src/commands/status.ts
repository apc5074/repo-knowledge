import { createRequire } from "node:module";

import type { CommandContext } from "../command-context.js";
import { buildSuccessResult, type CommandResult } from "../output/result.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { readonly version: string };

export async function statusCommand(context: CommandContext): Promise<CommandResult> {
  const [repositoryRoot, contract, localState] = await Promise.all([
    context.repositoryRoot(),
    context.contract(),
    context.localState()
  ]);
  const repositoryFound = repositoryRoot.ok;
  const contractFound = contract.ok || contract.reason !== "contract-not-found";
  const contractValid = contract.ok;
  const summary = buildStatusSummary(repositoryFound, contractFound, contractValid);
  const nextSteps = !repositoryFound
    ? ["Run board init from the repository root."]
    : !contractFound
      ? ["Run board init to create .board/repository.yaml."]
      : contract.ok
        ? []
        : ["Fix the contract issues above, then run board contract validate again."];

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
      runtime: {
        managed_services_running: false,
        note: "Runtime process status is implemented in a later phase."
      }
    },
    warnings:
      contract.ok || contract.issues.length === 0
        ? []
        : contract.issues.map((issue) => `${issue.path}: ${issue.message}`),
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

function buildStatusSummary(
  repositoryFound: boolean,
  contractFound: boolean,
  contractValid: boolean
): string {
  if (!repositoryFound) {
    return "Repository not found.";
  }

  if (!contractFound) {
    return "Repository found; contract missing.";
  }

  if (!contractValid) {
    return "Repository found; contract invalid.";
  }

  return "Repository found; contract valid.";
}
