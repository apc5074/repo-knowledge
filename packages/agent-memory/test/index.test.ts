import { describe, expect, it } from "vitest";

import { agentMemoryBoundary, agentMemoryPackage, plannedMemoryKinds } from "../src/index.js";

describe("@repo-knowledge/agent-memory", () => {
  it("exports the agent memory package identity", () => {
    expect(agentMemoryPackage.name).toBe("@repo-knowledge/agent-memory");
  });

  it("reserves memory kinds without allowing secret storage by default", () => {
    expect(plannedMemoryKinds).toContain("repository-fact");
    expect(plannedMemoryKinds).toContain("retrieval-embedding");
    expect(agentMemoryBoundary.doesNotOwn).toContain("secret values");
  });
});
