import { typesPackage } from "@repo-knowledge/types";

export const plannedMcpToolNames = [
  "get_repository_overview",
  "get_component",
  "get_task_context",
  "find_relevant_files",
  "find_symbol",
  "trace_request",
  "trace_event",
  "find_similar_implementation",
  "get_build_instructions",
  "get_validation_requirements",
  "get_known_problem",
  "get_related_repositories",
  "get_change_impact",
  "start_development_environment",
  "diagnose_environment",
  "run_relevant_checks"
] as const;

export type PlannedMcpToolName = (typeof plannedMcpToolNames)[number];

export type PlannedMcpToolMetadata = {
  readonly name: PlannedMcpToolName;
  readonly phase: "phase-0-placeholder";
  readonly implemented: false;
};

export const mcpServerPackage = {
  name: "@repo-knowledge/mcp-server",
  phase: typesPackage.phase
} as const;

export const plannedMcpTools: readonly PlannedMcpToolMetadata[] = plannedMcpToolNames.map(
  (name) => ({
    name,
    phase: "phase-0-placeholder",
    implemented: false
  })
);

export function getPlannedMcpTools(): readonly PlannedMcpToolMetadata[] {
  return plannedMcpTools;
}
