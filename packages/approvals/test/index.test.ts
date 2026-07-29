import { describe, expect, it } from "vitest";

import { approvalRequiredActions, approvalsBoundary, approvalsPackage } from "../src/index.js";

describe("@repo-knowledge/approvals", () => {
  it("exports the approvals package identity", () => {
    expect(approvalsPackage.name).toBe("@repo-knowledge/approvals");
  });

  it("reserves approval-gated repository-changing actions", () => {
    expect(approvalRequiredActions).toContain("apply-contract-update");
    expect(approvalRequiredActions).toContain("run-hosted-repository-command");
    expect(approvalsBoundary.owns).toContain("proposal application gates");
  });
});
