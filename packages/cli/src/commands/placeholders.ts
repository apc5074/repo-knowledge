import type { CommandContext } from "../command-context.js";
import { buildSuccessResult, type CommandResult } from "../output/result.js";

export const mvpPlaceholderCommands = [
  "init",
  "start",
  "status",
  "doctor",
  "explain",
  "task",
  "verify",
  "stop"
] as const;

export type MvpPlaceholderCommand = (typeof mvpPlaceholderCommands)[number];

export function buildPlaceholderCommandResult(
  command: MvpPlaceholderCommand | "contract",
  context: CommandContext
): CommandResult {
  return buildSuccessResult(context, {
    command,
    summary: `board ${command} is a Phase 2 placeholder. Implementation belongs to a later phase.`
  });
}
