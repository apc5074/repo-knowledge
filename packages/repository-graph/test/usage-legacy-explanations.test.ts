import { describe, expect, it } from "vitest";

import { explainLegacyCandidate } from "../src/legacy-explanations.js";
import { aggregateUsageEvidence } from "../src/usage-evidence.js";
import type { GraphSnapshot } from "../src/graph-store.js";

const build = { id: "build-1", repositoryRoot: "/repo", builtAt: "2026-01-01T00:00:00.000Z" };
const candidate = {
  id: "candidate",
  kind: "legacy_candidate" as const,
  key: "candidate",
  label: "old-api.ts",
  evidenceIds: ["candidate-evidence"],
  firstObservedBuildId: "build-1",
  lastObservedBuildId: "build-1",
  metadata: {
    status: "unreviewed",
    confidence: "medium",
    signalTypes: "deprecated",
    replacementHints: "new-api.ts"
  }
};
const target = {
  id: "target",
  kind: "file" as const,
  key: "src/old-api.ts",
  label: "src/old-api.ts",
  path: "src/old-api.ts",
  evidenceIds: [],
  firstObservedBuildId: "build-1",
  lastObservedBuildId: "build-1"
};
const consumer = {
  id: "consumer",
  kind: "file" as const,
  key: "src/server.ts",
  label: "src/server.ts",
  path: "src/server.ts",
  evidenceIds: [],
  firstObservedBuildId: "build-1",
  lastObservedBuildId: "build-1"
};
const snapshot: GraphSnapshot = {
  build,
  nodes: [candidate, target, consumer],
  evidence: [
    {
      id: "candidate-evidence",
      kind: "doctor",
      summary: "Deprecated marker",
      doctorRecordId: "candidate"
    }
  ],
  edges: [
    {
      id: "candidate-for",
      sourceNodeId: "candidate",
      targetNodeId: "target",
      kind: "candidate_for",
      confidence: "confirmed",
      evidenceIds: ["candidate-evidence"],
      extractorId: "doctor-ingest",
      firstObservedBuildId: "build-1",
      lastObservedBuildId: "build-1"
    },
    {
      id: "import",
      sourceNodeId: "consumer",
      targetNodeId: "target",
      kind: "imports",
      confidence: "high",
      evidenceIds: [],
      extractorId: "import",
      firstObservedBuildId: "build-1",
      lastObservedBuildId: "build-1"
    },
    {
      id: "replacement",
      sourceNodeId: "candidate",
      targetNodeId: "target",
      kind: "replaced_by",
      confidence: "high",
      evidenceIds: [],
      extractorId: "legacy",
      firstObservedBuildId: "build-1",
      lastObservedBuildId: "build-1"
    }
  ]
};

describe("usage evidence and legacy explanations", () => {
  it("keeps active usage signals separate and attaches them as counter-evidence", () => {
    const usage = aggregateUsageEvidence(snapshot);
    expect(usage.signals).toEqual([
      { targetNodeId: "target", kind: "import", edgeId: "import", confidence: "high" }
    ]);
    expect(usage.evidence[0]?.summary).toBe("Active import evidence");
    expect(usage.counterEvidenceEdges[0]?.kind).toBe("has_counter_evidence");
  });
  it("records weak and strong usage sources without promoting a weak signal to high confidence", () => {
    const relationshipKinds = [
      ["public-export", "exports", "low"],
      ["route", "handles_route", "high"],
      ["test", "tests", "medium"],
      ["command", "runs", "high"],
      ["verification", "verifies", "confirmed"],
      ["ci", "references", "medium"],
      ["documentation", "documents", "low"]
    ] as const;
    const usage = aggregateUsageEvidence({
      ...snapshot,
      edges: [
        ...snapshot.edges.filter((edge) => edge.id !== "import"),
        ...relationshipKinds.map(([id, kind, confidence]) => ({
          id,
          sourceNodeId: "consumer",
          targetNodeId: "target",
          kind,
          confidence,
          evidenceIds: [],
          extractorId: "test",
          firstObservedBuildId: "build-1",
          lastObservedBuildId: "build-1"
        }))
      ]
    });

    expect(usage.signals.map((signal) => [signal.kind, signal.confidence])).toEqual([
      ["public_export", "low"],
      ["route", "high"],
      ["test", "medium"],
      ["command", "high"],
      ["verification", "confirmed"],
      ["ci", "medium"],
      ["documentation", "low"]
    ]);
    expect(usage.counterEvidenceEdges).toHaveLength(1);
    expect(usage.counterEvidenceEdges[0]?.confidence).toBe("low");
  });
  it("explains confidence, named signals, active use, replacement, and reviewed status without deletion advice", () => {
    const explanation = explainLegacyCandidate({
      snapshot,
      candidateId: "candidate",
      usage: aggregateUsageEvidence(snapshot)
    });
    expect(explanation?.summary).toContain("medium-confidence");
    expect(explanation?.summary).toContain("Active-use counter-evidence");
    expect(explanation?.summary).toContain("replacement");
    expect(explanation?.warnings).toContain("This explanation does not imply safe deletion.");
    const reviewed = explainLegacyCandidate({
      snapshot: {
        ...snapshot,
        nodes: [
          { ...candidate, metadata: { ...candidate.metadata, status: "false_positive" } },
          target,
          consumer
        ]
      },
      candidateId: "candidate"
    });
    expect(reviewed?.warnings).toContain("Candidate status is false_positive.");
  });
});
