import { describe, expect, it } from "vitest";

import { getPlannedMcpTools, mcpServerPackage, plannedMcpToolNames } from "../src/index.js";

describe("@repo-knowledge/mcp-server", () => {
  it("exports the MCP server package identity", () => {
    expect(mcpServerPackage).toEqual({
      name: "@repo-knowledge/mcp-server",
      phase: "phase-0-placeholder"
    });
  });

  it("exports all planned MCP tool names in a stable list", () => {
    expect(plannedMcpToolNames).toEqual([
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
    ]);
  });

  it("marks all planned MCP tools as unimplemented Phase 0 placeholders", () => {
    expect(getPlannedMcpTools()).toEqual(
      plannedMcpToolNames.map((name) => ({
        name,
        phase: "phase-0-placeholder",
        implemented: false
      }))
    );
  });
});
