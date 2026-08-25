import type { RepositoryContract } from "@repo-knowledge/repository-contract";

import type { GraphBuildContext } from "./build-context.js";
import {
  stableGraphEdgeId,
  stableGraphEvidenceId,
  stableGraphNodeId,
  type GraphEdge,
  type GraphEvidence,
  type GraphNode,
  type RepositoryGraphConfidence,
  type RepositoryGraphNodeKind
} from "./types.js";

export type GraphIngestResult = {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly evidence: readonly GraphEvidence[];
  readonly warnings: readonly string[];
};

export function ingestRepositoryContract(input: {
  readonly context: GraphBuildContext;
  readonly buildId: string;
}): GraphIngestResult {
  const { context, buildId } = input;
  if (context.contract === undefined || context.contractPath === undefined) {
    return emptyIngestResult();
  }

  const records = createRecords(buildId);
  const contractEvidence = addContractEvidence(
    records,
    context.contractPath,
    "Repository contract"
  );
  const repository = addNode(records, {
    kind: "repository",
    key: ".",
    label: context.contract.repository.name,
    evidenceIds: [contractEvidence],
    metadata: {
      type: context.contract.repository.type,
      primaryLanguage: context.contract.repository.primary_language
    }
  });

  for (const application of Object.values(context.contract.applications ?? {})) {
    const node = addNode(records, {
      kind: "application",
      key: application.id,
      label: application.name ?? application.id,
      evidenceIds: [contractEvidence],
      metadata: { type: application.type, workingDirectory: application.working_directory ?? "." }
    });
    addEdge(
      records,
      repository.id,
      node.id,
      "contains",
      "confirmed",
      [contractEvidence],
      "contract-ingest"
    );
    if (application.entrypoint) {
      const file = addNode(records, {
        kind: "file",
        key: application.entrypoint,
        label: application.entrypoint,
        path: application.entrypoint,
        evidenceIds: [contractEvidence]
      });
      addEdge(
        records,
        node.id,
        file.id,
        "owns",
        "confirmed",
        [contractEvidence],
        "contract-ingest"
      );
    }
    addCommandNodes(records, repository.id, application.id, application, contractEvidence);
  }

  for (const service of Object.values(context.contract.services ?? {})) {
    const node = addNode(records, {
      kind: "service",
      key: service.id,
      label: service.name ?? service.id,
      evidenceIds: [contractEvidence],
      metadata: { type: service.type, required: service.required ?? true }
    });
    addEdge(
      records,
      repository.id,
      node.id,
      "contains",
      "confirmed",
      [contractEvidence],
      "contract-ingest"
    );
  }

  for (const generated of context.contract.generated_files ?? []) {
    const node = addNode(records, {
      kind: "generated_artifact",
      key: generated.pattern,
      label: generated.pattern,
      path: generated.pattern,
      evidenceIds: [contractEvidence]
    });
    addEdge(
      records,
      repository.id,
      node.id,
      "contains",
      "confirmed",
      [contractEvidence],
      "contract-ingest"
    );
  }

  for (const unsafe of context.contract.unsafe_paths ?? []) {
    const node = addNode(records, {
      kind: "file",
      key: unsafe.pattern,
      label: unsafe.pattern,
      path: unsafe.pattern,
      evidenceIds: [contractEvidence]
    });
    addEdge(
      records,
      repository.id,
      node.id,
      "unsafe_to_edit",
      "confirmed",
      [contractEvidence],
      "contract-ingest"
    );
  }

  return finalize(records);
}

function addCommandNodes(
  records: MutableRecords,
  repositoryId: string,
  applicationId: string,
  application: NonNullable<RepositoryContract["applications"]>[string],
  evidenceId: string
): void {
  for (const [kind, command] of Object.entries({
    start: application.start,
    dev: application.dev,
    build: application.build
  })) {
    if (!command) continue;
    const node = addNode(records, {
      kind: "command",
      key: `application:${applicationId}:${kind}`,
      label: command.command,
      evidenceIds: [evidenceId],
      metadata: { category: kind, command: command.command }
    });
    addEdge(
      records,
      repositoryId,
      node.id,
      "contains",
      "confirmed",
      [evidenceId],
      "contract-ingest"
    );
  }
}

type MutableRecords = {
  readonly buildId: string;
  readonly nodes: Map<string, GraphNode>;
  readonly edges: Map<string, GraphEdge>;
  readonly evidence: Map<string, GraphEvidence>;
  readonly warnings: string[];
};

function createRecords(buildId: string): MutableRecords {
  return { buildId, nodes: new Map(), edges: new Map(), evidence: new Map(), warnings: [] };
}

function addContractEvidence(
  records: MutableRecords,
  contractPath: string,
  summary: string
): string {
  const evidence: GraphEvidence = {
    id: stableGraphEvidenceId({ kind: "contract", summary, contractPath }),
    kind: "contract",
    summary,
    contractPath
  };
  records.evidence.set(evidence.id, evidence);
  return evidence.id;
}

function addNode(
  records: MutableRecords,
  input: {
    readonly kind: RepositoryGraphNodeKind;
    readonly key: string;
    readonly label: string;
    readonly path?: string;
    readonly evidenceIds: readonly string[];
    readonly metadata?: Readonly<Record<string, string | number | boolean>>;
  }
): GraphNode {
  const id = stableGraphNodeId({ kind: input.kind, key: input.key });
  const existing = records.nodes.get(id);
  if (existing) return existing;
  const node: GraphNode = {
    id,
    kind: input.kind,
    key: input.key,
    label: input.label,
    path: input.path,
    evidenceIds: input.evidenceIds,
    firstObservedBuildId: records.buildId,
    lastObservedBuildId: records.buildId,
    metadata: input.metadata
  };
  records.nodes.set(id, node);
  return node;
}

function addEdge(
  records: MutableRecords,
  sourceNodeId: string,
  targetNodeId: string,
  kind: GraphEdge["kind"],
  confidence: RepositoryGraphConfidence,
  evidenceIds: readonly string[],
  extractorId: string
): void {
  const id = stableGraphEdgeId({ sourceNodeId, targetNodeId, kind, extractorId });
  records.edges.set(id, {
    id,
    sourceNodeId,
    targetNodeId,
    kind,
    confidence,
    evidenceIds,
    extractorId,
    firstObservedBuildId: records.buildId,
    lastObservedBuildId: records.buildId
  });
}

function finalize(records: MutableRecords): GraphIngestResult {
  return {
    nodes: [...records.nodes.values()],
    edges: [...records.edges.values()],
    evidence: [...records.evidence.values()],
    warnings: records.warnings
  };
}

function emptyIngestResult(): GraphIngestResult {
  return { nodes: [], edges: [], evidence: [], warnings: [] };
}
