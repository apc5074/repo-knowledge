#!/usr/bin/env node

export {
  boardCommands,
  cliPackage,
  createBoardProgram,
  getVersionInfo,
  renderHelp,
  runBoardCli,
  runBoardCliAsync
} from "./app.js";
export type { BoardCommandName, CliResult, VersionInfo } from "./app.js";
export {
  createCommandContext,
  createCommandContextFromCommand,
  loadRepositoryContractFromContext,
  resolveContractPathFromContext
} from "./command-context.js";
export { validateContractCommand } from "./commands/contract/validate.js";
export { initCommand } from "./commands/init.js";
export type { InitCommandData, InitCommandOptions } from "./commands/init.js";
export { buildPlaceholderCommandResult, mvpPlaceholderCommands } from "./commands/placeholders.js";
export type { MvpPlaceholderCommand } from "./commands/placeholders.js";
export { scanCommand } from "./commands/scan.js";
export type { ScanCommandData, ScanCommandOptions } from "./commands/scan.js";
export { statusCommand } from "./commands/status.js";
export type {
  AgentCommandMetadata,
  CommandContext,
  CommandContextInput,
  CommandPrinter,
  GlobalCliFlags,
  OutputMode
} from "./command-context.js";
export { defaultContractRelativePath, resolveContractPath } from "./config/contract-path.js";
export type {
  ContractPathResult,
  ContractPathSource,
  ResolveContractPathInput
} from "./config/contract-path.js";
export { loadRepositoryContract } from "./config/contract-loader.js";
export type { ContractLoadIssue, ContractLoadResult } from "./config/contract-loader.js";
export {
  createRepositoryStateKey,
  ensureLocalStateDirectories,
  resolveLocalStatePaths
} from "./config/local-state.js";
export type {
  LocalStatePaths,
  LocalStatePlatform,
  ResolveLocalStatePathsInput
} from "./config/local-state.js";
export { defaultUserConfig, loadUserConfig, resolveUserConfigPath } from "./config/user-config.js";
export type {
  BoardOutputModePreference,
  ResolvedUserConfig,
  ResolveUserConfigInput,
  UserConfig
} from "./config/user-config.js";
export { discoverRepositoryRoot } from "./config/repository-root.js";
export type { RepositoryRootFoundBy, RepositoryRootResult } from "./config/repository-root.js";
export { exitCodes } from "./errors/exit-codes.js";
export type { ExitCode } from "./errors/exit-codes.js";
export {
  BoardError,
  boardErrorToResult,
  commandNotImplementedError,
  contractInvalidError,
  contractNotFoundError,
  externalCommandFailedError,
  interruptedError,
  isBoardError,
  permissionOrAccessError,
  repositoryNotFoundError,
  unexpectedErrorToResult,
  unexpectedInternalError,
  usageError
} from "./errors/board-error.js";
export type { BoardErrorCode, BoardErrorInput } from "./errors/board-error.js";
export {
  createInterruptController,
  installInterruptHandlers,
  interruptedPromise,
  throwIfInterrupted
} from "./interrupt.js";
export type {
  InstalledInterruptHandlers,
  InterruptController,
  InterruptSignalName,
  ProcessSignalTarget
} from "./interrupt.js";
export {
  buildCommandResult,
  buildFailureResult,
  buildSuccessResult,
  serializeCommandResult,
  summarizeCommandResult
} from "./output/result.js";
export type {
  BuildCommandResultInput,
  CommandCandidateFinding,
  CommandResult,
  CommandResultError,
  CommandResultStatus,
  CommandReviewItem
} from "./output/result.js";
export { printHumanResult } from "./output/human.js";
export type { HumanPrinterOptions } from "./output/human.js";
export { printJsonResult } from "./output/json.js";
export { printCommandResult } from "./output/printer.js";
export { runCommand, runCommandSync } from "./runner.js";
export type { CommandHandler, RunCommandInput, SyncCommandHandler } from "./runner.js";
export {
  assertBoardIdentifier,
  createBoardIdentifier,
  generateAgentRunId,
  generateSessionId,
  generateToolCallId,
  isBoardIdentifier,
  resolveSessionPath
} from "./session.js";
export type { BoardIdentifierKind, SessionPathInput, SessionPathKind } from "./session.js";
export { createNoopTelemetryClient, sanitizeTelemetryProperties } from "./telemetry.js";
export type {
  CommandTelemetryProperties,
  TelemetryClient,
  TelemetryClientInput,
  TelemetryProperties
} from "./telemetry.js";

import { runBoardCliAsync } from "./app.js";

if (isDirectExecution()) {
  const result = await runBoardCliAsync(process.argv.slice(2));

  if (result.stdout.length > 0) {
    console.log(result.stdout);
  }

  if (result.stderr.length > 0) {
    console.error(result.stderr);
  }

  process.exitCode = result.exitCode;
}

function isDirectExecution(): boolean {
  return (
    process.argv[1] !== undefined && import.meta.url === new URL(process.argv[1], "file:").href
  );
}
