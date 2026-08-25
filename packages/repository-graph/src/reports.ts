import type { GraphInvalidationPlan } from "./invalidation.js";
import type { GraphExplanation, GraphQueryResult, GraphBuild } from "./types.js";

export function formatGraphBuildReport(build: GraphBuild): string {
  const summary = build.summary;
  return [
    `Graph build ${build.id}`,
    `Nodes: ${summary?.nodeCount ?? 0}`,
    `Edges: ${summary?.edgeCount ?? 0}`,
    `Evidence: ${summary?.evidenceCount ?? 0}`,
    `Built: ${build.builtAt}`
  ].join("\n");
}
export function formatGraphStatusReport(plan: GraphInvalidationPlan): string {
  const lines = [
    `Graph status: ${plan.mode}`,
    `Added: ${plan.addedPaths.length}`,
    `Changed: ${plan.changedPaths.length}`,
    `Deleted: ${plan.deletedPaths.length}`,
    `Renamed: ${plan.renamedPaths.length}`
  ];
  if (plan.reason) lines.push(`Reason: ${plan.reason}`);
  if (plan.changedPaths.length) lines.push(`Changed paths: ${plan.changedPaths.join(", ")}`);
  return lines.join("\n");
}
export function formatGraphRelatedReport(result: GraphQueryResult): string {
  if (result.warnings.length && result.nodes.length === 0) return result.warnings.join("\n");
  const lines = [`Related records: ${result.nodes.length}`];
  for (const node of result.nodes.slice(0, 20)) lines.push(`- ${node.kind}: ${node.label}`);
  if (result.nodes.length > 20) lines.push(`- ${result.nodes.length - 20} more`);
  return lines.join("\n");
}
export function formatGraphExplanationReport(explanation: GraphExplanation): string {
  const lines = [
    explanation.summary,
    `Target: ${explanation.target.kind} ${explanation.target.label}`,
    `Relationships: ${explanation.relationships.length}`
  ];
  for (const evidence of explanation.evidence.slice(0, 5))
    lines.push(
      `Evidence: ${evidence.summary}${evidence.sourceLocation ? ` (${evidence.sourceLocation.path}:${evidence.sourceLocation.startLine ?? 1})` : ""}`
    );
  lines.push(...explanation.warnings.map((warning) => `Caveat: ${warning}`));
  return lines.join("\n");
}
