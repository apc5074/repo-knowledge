import { describe, expect, it } from "vitest";

import { agentToolsBoundary, agentToolsPackage, plannedToolCategories } from "../src/index.js";

describe("@repo-knowledge/agent-tools", () => {
  it("exports the agent tools package identity", () => {
    expect(agentToolsPackage.name).toBe("@repo-knowledge/agent-tools");
  });

  it("reserves policy-checked tool categories", () => {
    expect(plannedToolCategories).toContain("approved-command-execution");
    expect(plannedToolCategories).toContain("human-approval-request");
    expect(agentToolsBoundary.owns).toContain("policy checks before execution");
  });
});
