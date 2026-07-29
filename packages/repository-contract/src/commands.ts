import { commandStepSchema } from "./schema.js";
import type { CommandStep } from "./types.js";

export type CommandInput = string | CommandStep;

export function normalizeCommand(input: CommandInput): CommandStep {
  if (typeof input === "string") {
    return commandStepSchema.parse({
      command: input
    });
  }

  return commandStepSchema.parse(input);
}
