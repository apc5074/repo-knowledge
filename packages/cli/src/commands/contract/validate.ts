import { loadRepositoryContractFromContext, type CommandContext } from "../../command-context.js";
import {
  contractInvalidError,
  contractNotFoundError,
  permissionOrAccessError,
  repositoryNotFoundError
} from "../../errors/board-error.js";
import { buildSuccessResult, type CommandResult } from "../../output/result.js";

export async function validateContractCommand(
  filePath: string | undefined,
  includeJsonData: boolean,
  context: CommandContext
): Promise<CommandResult> {
  const result = await loadRepositoryContractFromContext(context, filePath);

  if (!result.ok) {
    throw contractLoadFailureToBoardError(result);
  }

  return buildSuccessResult(context, {
    command: "contract validate",
    summary: `Valid repository contract: ${result.path}`,
    data: includeJsonData
      ? {
          path: result.path,
          repository: result.contract.repository.name
        }
      : undefined,
    repository: {
      name: result.contract.repository.name
    },
    contract: {
      path: result.path,
      valid: true
    }
  });
}

function contractLoadFailureToBoardError(
  error: Exclude<
    Awaited<ReturnType<typeof loadRepositoryContractFromContext>>,
    { readonly ok: true }
  >
) {
  if (error.reason === "repository-not-found") {
    return repositoryNotFoundError(error.message, error.nextSteps);
  }

  if (error.reason === "contract-not-found") {
    return contractNotFoundError(error.message, error.path, error.nextSteps);
  }

  if (error.reason === "contract-invalid") {
    return contractInvalidError(error.message, error.path, error.issues, error.nextSteps);
  }

  return permissionOrAccessError(error.message, error.path);
}
