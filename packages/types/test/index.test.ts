import { describe, expect, it } from "vitest";

import { typesPackage, type AgentTraceIds, type EvidenceReference } from "../src/index.js";

describe("@repo-knowledge/types", () => {
  it("exports the package identity", () => {
    expect(typesPackage).toEqual({
      name: "@repo-knowledge/types",
      phase: "phase-0-placeholder"
    });
  });

  it("exports placeholder domain types", () => {
    const evidence: EvidenceReference = {
      sourcePath: "package.json",
      confidence: "high"
    };

    expect(evidence.sourcePath).toBe("package.json");
  });

  it("exports agent trace ID placeholders", () => {
    const trace: AgentTraceIds = {};

    expect(trace).toEqual({});
  });
});
