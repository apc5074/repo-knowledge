import type { CommandResult } from "./result.js";

export type HumanPrinterOptions = {
  readonly quiet?: boolean;
  readonly verbose?: boolean;
  readonly color?: boolean;
};

export function printHumanResult(result: CommandResult, options: HumanPrinterOptions = {}): string {
  if (options.quiet === true && result.ok) {
    return "";
  }

  const lines = [formatSummary(result, Boolean(options.color))];

  if (result.warnings.length > 0) {
    lines.push(
      ...result.warnings.map((warning) => colorize(`Warning: ${warning}`, "yellow", options))
    );
  }

  if (result.errors.length > 0) {
    lines.push(
      ...result.errors.map((error) => colorize(`Error: ${error.message}`, "red", options))
    );
  }

  if (result.next_steps.length > 0) {
    lines.push(...result.next_steps.map((nextStep) => `Next: ${nextStep}`));
  }

  if (options.verbose === true) {
    lines.push(`Command: ${result.command}`);
    lines.push(`Session: ${result.session_id}`);

    if (result.repository?.root !== undefined) {
      lines.push(`Repository: ${result.repository.root}`);
    }

    if (result.contract?.path !== undefined) {
      lines.push(`Contract: ${result.contract.path}`);
    }
  }

  return lines.join("\n");
}

function formatSummary(result: CommandResult, color: boolean): string {
  if (result.ok) {
    return colorize(result.summary, "green", { color });
  }

  return colorize(result.summary, "red", { color });
}

function colorize(
  text: string,
  color: "green" | "red" | "yellow",
  options: HumanPrinterOptions
): string {
  if (options.color !== true) {
    return text;
  }

  const code = color === "green" ? "\u001b[32m" : color === "red" ? "\u001b[31m" : "\u001b[33m";

  return `${code}${text}\u001b[0m`;
}
