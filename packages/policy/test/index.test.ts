import { describe, expect, it } from "vitest";

import { plannedPolicyDomains, policyBoundary, policyPackage } from "../src/index.js";

describe("@repo-knowledge/policy", () => {
  it("exports the policy package identity", () => {
    expect(policyPackage.name).toBe("@repo-knowledge/policy");
  });

  it("reserves policy domains for agent safety decisions", () => {
    expect(plannedPolicyDomains).toContain("shell-command");
    expect(plannedPolicyDomains).toContain("model-call");
    expect(policyBoundary.owns).toContain("policy decision records");
  });
});
