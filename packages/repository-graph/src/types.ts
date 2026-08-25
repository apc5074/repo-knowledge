import { createHash } from "node:crypto";

export const repositoryGraphNodeKinds = [
  "repository",
  "file",
  "directory",
  "package",
  "workspace",
  "component",
  "application",
  "service",
  "worker",
  "queue",
  "route",
  "symbol",
  "command",
  "script",
  "ci_job",
  "test",
  "database",
  "table",
  "migration",
  "generated_artifact",
  "document",
  "agent_instruction",
  "verification_check",
  "known_problem",
  "legacy_candidate"
] as const;

export type RepositoryGraphNodeKind = (typeof repositoryGraphNodeKinds)[number];

export const repositoryGraphEdgeKinds = [
  "contains",
  "owns",
  "exports",
  "imports",
  "depends_on",
  "registers",
  "handles_route",
  "calls",
  "reads",
  "writes",
  "tests",
  "documents",
  "references",
  "runs",
  "verifies",
  "generates",
  "unsafe_to_edit",
  "replaced_by",
  "candidate_for",
  "has_usage_evidence",
  "has_counter_evidence",
  "matched_known_problem"
] as const;

export type RepositoryGraphEdgeKind = (typeof repositoryGraphEdgeKinds)[number];

export const repositoryGraphConfidenceLevels = ["low", "medium", "high", "confirmed"] as const;

export type RepositoryGraphConfidence = (typeof repositoryGraphConfidenceLevels)[number];

export const repositoryGraphEvidenceKinds = [
  "source_location",
  "scanner_fact",
  "contract",
  "verification",
  "doctor",
  "command",
  "ci_config",
  "local_state",
  "build_metadata"
] as const;

export type RepositoryGraphEvidenceKind = (typeof repositoryGraphEvidenceKinds)[number];

export const repositoryGraphQueryCapabilities = [
  "getNode",
  "getNeighbors",
  "traverse",
  "findPath",
  "getEvidence",
  "explainRelationship"
] as const;

export type RepositoryGraphQueryCapability = (typeof repositoryGraphQueryCapabilities)[number];

export type BuildRepositoryGraphInput = {
  readonly repositoryRoot?: string;
  readonly repositoryStateRoot?: string;
  readonly force?: boolean;
  readonly changedOnly?: boolean;
};

export type QueryRepositoryGraphInput = {
  readonly target: string;
  readonly kinds?: readonly RepositoryGraphNodeKind[];
  readonly depth?: number;
};

export type ExplainRepositoryGraphInput = {
  readonly target: string;
  readonly includeEvidence?: boolean;
};

export type GraphSourceLocation = {
  readonly path: string;
  readonly startLine?: number;
  readonly startColumn?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
};

export type GraphEvidence = {
  readonly id: string;
  readonly kind: RepositoryGraphEvidenceKind;
  readonly summary: string;
  readonly sourceLocation?: GraphSourceLocation;
  readonly scannerFactId?: string;
  readonly contractPath?: string;
  readonly verificationRunId?: string;
  readonly verificationCheckId?: string;
  readonly doctorRecordKind?: "known_problem" | "legacy_candidate" | "finding";
  readonly doctorRecordId?: string;
  readonly commandSource?: string;
  readonly ciJobName?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
};

export type GraphNode = {
  readonly id: string;
  readonly kind: RepositoryGraphNodeKind;
  readonly key: string;
  readonly label: string;
  readonly path?: string;
  readonly parentId?: string;
  readonly evidenceIds: readonly string[];
  readonly firstObservedBuildId: string;
  readonly lastObservedBuildId: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
};

export type GraphEdge = {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly kind: RepositoryGraphEdgeKind;
  readonly confidence: RepositoryGraphConfidence;
  readonly evidenceIds: readonly string[];
  readonly extractorId: string;
  readonly firstObservedBuildId: string;
  readonly lastObservedBuildId: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
};

export type GraphBuild = {
  readonly id: string;
  readonly repositoryRoot: string;
  readonly repositoryStateRoot?: string;
  readonly commitSha?: string;
  readonly scannerFingerprint?: string;
  readonly contractPath?: string;
  readonly contractVersion?: string;
  readonly builtAt: string;
  readonly invalidationState?: Readonly<Record<string, string | number | boolean>>;
  readonly summary?: {
    readonly nodeCount: number;
    readonly edgeCount: number;
    readonly evidenceCount: number;
  };
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
};

export type GraphQuery = {
  readonly target: string;
  readonly kinds?: readonly RepositoryGraphNodeKind[];
  readonly depth?: number;
};

export type GraphQueryResult = {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly evidence: readonly GraphEvidence[];
  readonly warnings: readonly string[];
};

export type GraphExplanation = {
  readonly target: GraphNode;
  readonly relatedNodes: readonly GraphNode[];
  readonly relationships: readonly GraphEdge[];
  readonly evidence: readonly GraphEvidence[];
  readonly summary: string;
  readonly warnings: readonly string[];
};

export function stableGraphId(
  namespace: string,
  parts: readonly (string | number | boolean)[]
): string {
  const hash = createHash("sha256");
  hash.update(namespace);
  for (const part of parts) {
    hash.update("\0");
    hash.update(String(part));
  }

  return `${namespace}-${hash.digest("hex").slice(0, 16)}`;
}

export function stableGraphNodeId(input: {
  readonly kind: RepositoryGraphNodeKind;
  readonly key: string;
}): string {
  return stableGraphId("node", [input.kind, input.key]);
}

export function stableGraphEdgeId(input: {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly kind: RepositoryGraphEdgeKind;
  readonly extractorId: string;
}): string {
  return stableGraphId("edge", [
    input.sourceNodeId,
    input.targetNodeId,
    input.kind,
    input.extractorId
  ]);
}

export function stableGraphEvidenceId(input: {
  readonly kind: RepositoryGraphEvidenceKind;
  readonly summary: string;
  readonly sourceLocation?: GraphSourceLocation;
  readonly scannerFactId?: string;
  readonly contractPath?: string;
  readonly verificationRunId?: string;
  readonly verificationCheckId?: string;
  readonly doctorRecordId?: string;
  readonly commandSource?: string;
  readonly ciJobName?: string;
}): string {
  return stableGraphId("evidence", [
    input.kind,
    input.summary,
    input.sourceLocation?.path ?? "",
    input.sourceLocation?.startLine ?? "",
    input.sourceLocation?.startColumn ?? "",
    input.sourceLocation?.endLine ?? "",
    input.sourceLocation?.endColumn ?? "",
    input.scannerFactId ?? "",
    input.contractPath ?? "",
    input.verificationRunId ?? "",
    input.verificationCheckId ?? "",
    input.doctorRecordId ?? "",
    input.commandSource ?? "",
    input.ciJobName ?? ""
  ]);
}
