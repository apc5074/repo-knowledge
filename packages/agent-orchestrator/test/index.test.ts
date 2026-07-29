import { describe, expect, it } from "vitest";

import {
  agentOrchestratorBoundary,
  agentOrchestratorPackage,
  plannedMaintenanceAgents
} from "../src/index.js";

describe("@repo-knowledge/agent-orchestrator", () => {
  it("exports the agent orchestrator package identity", () => {
    expect(agentOrchestratorPackage.name).toBe("@repo-knowledge/agent-orchestrator");
  });

  it("reserves the initial maintenance agent list and orchestration boundary", () => {
    expect(plannedMaintenanceAgents).toContain("documentation");
    expect(plannedMaintenanceAgents).toContain("policy-safety");
    expect(agentOrchestratorBoundary.doesNotOwn).toContain("direct shell execution");
  });
});
