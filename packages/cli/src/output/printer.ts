import type { CommandContext } from "../command-context.js";
import { printHumanResult } from "./human.js";
import { printJsonResult } from "./json.js";
import type { CommandResult } from "./result.js";

export function printCommandResult(context: CommandContext, result: CommandResult): string {
  if (context.outputMode === "json") {
    return printJsonResult(result);
  }

  return printHumanResult(result, {
    quiet: context.globalFlags.quiet,
    verbose: context.globalFlags.verbose,
    color: context.globalFlags.color
  });
}
