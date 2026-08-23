import { describe, expect, it } from "vitest";

import { typesPackage, type AgentTraceIds, type EvidenceReference } from "../src/index.js";

describe("@repo-knowledge/types", () => {
  it("exports the package identity", () => {
    expect(typesPackage).toEqual({
      name: "@repo-knowledge/types",
      phase: "phase-0-placeholder",
      status: "shared-types"
    });
  });

  it("exports shared domain types", () => {
    const evidence: EvidenceReference = {
      sourcePath: "package.json",
      confidence: "high"
    };

    expect(evidence.sourcePath).toBe("package.json");
  });

  it("exports agent trace ID aliases", () => {
    const trace: AgentTraceIds = {};

    expect(trace).toEqual({});
  });
});
