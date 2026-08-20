import type { RuntimePlannedCommand, RuntimeStep, RuntimeStepKind } from "./types.js";

export function createRuntimeStep(
  id: string,
  kind: RuntimeStepKind,
  title: string,
  input: {
    readonly summary?: string;
    readonly dependsOn?: readonly string[];
    readonly command?: RuntimePlannedCommand;
    readonly optional?: boolean;
    readonly skippedReason?: string;
  } = {}
): RuntimeStep {
  return {
    id,
    kind,
    title,
    status: "pending",
    summary: input.summary ?? "Pending implementation.",
    dependsOn: input.dependsOn ?? [],
    command: input.command,
    optional: input.optional,
    skippedReason: input.skippedReason
  };
}
