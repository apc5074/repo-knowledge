import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ScannerFact } from "@repo-knowledge/scanner-core";

import type { GraphBuildContext } from "./build-context.js";
import type { GraphIngestResult } from "./contract-ingest.js";
import {
  stableGraphEdgeId,
  stableGraphEvidenceId,
  stableGraphNodeId,
  type GraphEdge,
  type GraphEvidence,
  type GraphNode
} from "./types.js";

export type ReferenceIndexInput = {
  readonly context: GraphBuildContext;
  readonly buildId: string;
  readonly readSource?: (path: string) => Promise<string>;
};
export async function buildReferenceIndex(input: ReferenceIndexInput): Promise<GraphIngestResult> {
  const records = createRecords(input.buildId);
  const commands = new Map<string, GraphNode>();
  for (const fact of input.context.scannerResult.facts.filter(
    (fact) => fact.kind === "command.detected"
  )) {
    const value = objectValue(fact.value);
    const command = stringValue(value.command);
    const name = stringValue(value.name) ?? command;
    if (!command || !name) continue;
    const evidenceIds = factEvidence(records, fact);
    const nodeValue = node(
      records,
      "command",
      `command:${name}:${stringValue(value.cwd) ?? "."}`,
      command,
      undefined,
      evidenceIds
    );
    commands.set(command, nodeValue);
    for (const path of input.context.inventory.files.filter((path) => command.includes(path)))
      edge(
        records,
        nodeValue.id,
        node(records, "file", path, path, path, []).id,
        "references",
        "high",
        evidenceIds,
        "reference-index"
      );
  }
  for (const fact of input.context.scannerResult.facts.filter(
    (fact) => fact.kind === "ci.workflow_detected"
  )) {
    const value = objectValue(fact.value);
    const path = stringValue(value.path);
    const jobs = Array.isArray(value.jobs) ? value.jobs : [];
    const evidenceIds = factEvidence(records, fact);
    for (const job of jobs) {
      const record = objectValue(job);
      const jobId = stringValue(record.id);
      if (!jobId || !path) continue;
      const ci = node(records, "ci_job", `${path}:${jobId}`, jobId, path, evidenceIds);
      for (const command of Array.isArray(record.commands)
        ? record.commands.filter((item): item is string => typeof item === "string")
        : []) {
        const commandNode =
          commands.get(command) ??
          node(
            records,
            "command",
            `ci:${path}:${jobId}:${command}`,
            command,
            undefined,
            evidenceIds
          );
        edge(records, ci.id, commandNode.id, "runs", "high", evidenceIds, "reference-index");
      }
    }
  }
  const setup = input.context.contract?.setup;
  for (const [name, command] of Object.entries({
    install: setup?.install,
    build: setup?.build_containers,
    start: setup?.start_services,
    migrate: setup?.migrate,
    seed: setup?.seed,
    generate: setup?.generate
  }))
    if (command)
      commands.set(
        command.command,
        node(records, "command", `setup:${name}`, command.command, undefined, [
          contractEvidence(records, input.context.contractPath)
        ])
      );
  for (const check of input.context.contract?.verification?.default ?? []) {
    const evidenceId = contractEvidence(records, input.context.contractPath);
    const verification = node(
      records,
      "verification_check",
      check.id,
      check.id,
      undefined,
      [evidenceId],
      { kind: check.kind ?? "custom" }
    );
    const command = node(
      records,
      "command",
      `verification:${check.id}`,
      check.command.command,
      undefined,
      [evidenceId]
    );
    edge(
      records,
      verification.id,
      command.id,
      "runs",
      "confirmed",
      [evidenceId],
      "reference-index"
    );
    for (const path of check.paths ?? [])
      edge(
        records,
        verification.id,
        node(records, "file", path, path, path, [evidenceId]).id,
        "verifies",
        "confirmed",
        [evidenceId],
        "reference-index"
      );
    for (const component of check.components ?? [])
      edge(
        records,
        verification.id,
        stableGraphNodeId({ kind: "component", key: component }),
        "verifies",
        "confirmed",
        [evidenceId],
        "reference-index"
      );
  }
  for (const fact of input.context.scannerResult.facts.filter(
    (fact) => fact.kind === "documentation.detected" || fact.kind === "agent_instruction.detected"
  )) {
    const value = objectValue(fact.value);
    const path = stringValue(value.path);
    if (!path) continue;
    const evidenceIds = factEvidence(records, fact);
    const document = node(
      records,
      fact.kind === "documentation.detected" ? "document" : "agent_instruction",
      path,
      path,
      path,
      evidenceIds
    );
    let text: string;
    try {
      text = await (
        input.readSource ??
        ((relativePath) => readFile(join(input.context.repositoryRoot, relativePath), "utf8"))
      )(path);
    } catch {
      records.warnings.push(`Could not read reference document ${path}.`);
      continue;
    }
    for (const targetPath of input.context.inventory.files.filter((candidate) =>
      text.includes(candidate)
    ))
      edge(
        records,
        document.id,
        node(records, "file", targetPath, targetPath, targetPath, []).id,
        "documents",
        "medium",
        [evidence(records, path, text, targetPath)],
        "reference-index"
      );
    for (const [command, commandNode] of commands)
      if (text.includes(command))
        edge(
          records,
          document.id,
          commandNode.id,
          "documents",
          "low",
          [evidence(records, path, text, command)],
          "reference-index"
        );
  }
  return result(records);
}
type Records = {
  buildId: string;
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  evidence: Map<string, GraphEvidence>;
  warnings: string[];
};
function createRecords(buildId: string): Records {
  return { buildId, nodes: new Map(), edges: new Map(), evidence: new Map(), warnings: [] };
}
function node(
  records: Records,
  kind: GraphNode["kind"],
  key: string,
  label: string,
  path: string | undefined,
  evidenceIds: readonly string[],
  metadata?: Readonly<Record<string, string | number | boolean>>
): GraphNode {
  const id = stableGraphNodeId({ kind, key });
  const current = records.nodes.get(id);
  if (current) return current;
  const value: GraphNode = {
    id,
    kind,
    key,
    label,
    path,
    evidenceIds,
    firstObservedBuildId: records.buildId,
    lastObservedBuildId: records.buildId,
    metadata
  };
  records.nodes.set(id, value);
  return value;
}
function factEvidence(records: Records, fact: ScannerFact): readonly string[] {
  return fact.evidence.map((source) => {
    const id = stableGraphEvidenceId({
      kind: "scanner_fact",
      summary: `${fact.kind} from ${fact.detector}`,
      scannerFactId: fact.id,
      sourceLocation: { path: source.source_path, startLine: source.line_start }
    });
    records.evidence.set(id, {
      id,
      kind: "scanner_fact",
      summary: `${fact.kind} from ${fact.detector}`,
      scannerFactId: fact.id,
      sourceLocation: { path: source.source_path, startLine: source.line_start }
    });
    return id;
  });
}
function contractEvidence(records: Records, contractPath: string | undefined): string {
  const id = stableGraphEvidenceId({
    kind: "contract",
    summary: "Repository contract reference",
    contractPath
  });
  records.evidence.set(id, {
    id,
    kind: "contract",
    summary: "Repository contract reference",
    contractPath
  });
  return id;
}
function evidence(records: Records, path: string, text: string, target: string): string {
  const id = stableGraphEvidenceId({
    kind: "source_location",
    summary: `Document reference ${target}`,
    sourceLocation: { path, startLine: text.slice(0, text.indexOf(target)).split(/\r?\n/).length }
  });
  records.evidence.set(id, {
    id,
    kind: "source_location",
    summary: `Document reference ${target}`,
    sourceLocation: { path, startLine: text.slice(0, text.indexOf(target)).split(/\r?\n/).length }
  });
  return id;
}
function edge(
  records: Records,
  sourceNodeId: string,
  targetNodeId: string,
  kind: GraphEdge["kind"],
  confidence: GraphEdge["confidence"],
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
function objectValue(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function result(records: Records): GraphIngestResult {
  return {
    nodes: [...records.nodes.values()],
    edges: [...records.edges.values()],
    evidence: [...records.evidence.values()],
    warnings: records.warnings
  };
}
