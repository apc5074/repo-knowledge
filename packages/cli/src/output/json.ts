import type { CommandResult } from "./result.js";

export function printJsonResult(result: CommandResult): string {
  return JSON.stringify(stripUndefined(result), null, 2);
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, stripUndefined(entryValue)])
    );
  }

  return value;
}
