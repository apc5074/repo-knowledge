import type { GraphInvalidationPlan } from "./invalidation.js";
import type { GraphBuild, GraphExplanation, GraphQueryResult } from "./types.js";
export const repositoryGraphJsonSchemaVersion = 1 as const;
export function graphBuildJson(build: GraphBuild) {
  return { schema_version: repositoryGraphJsonSchemaVersion, kind: "graph_build" as const, build };
}
export function graphStatusJson(status: GraphInvalidationPlan) {
  return {
    schema_version: repositoryGraphJsonSchemaVersion,
    kind: "graph_status" as const,
    status
  };
}
export function graphQueryJson(query: GraphQueryResult) {
  return { schema_version: repositoryGraphJsonSchemaVersion, kind: "graph_query" as const, query };
}
export function graphExplanationJson(explanation: GraphExplanation) {
  return {
    schema_version: repositoryGraphJsonSchemaVersion,
    kind: "graph_explanation" as const,
    explanation
  };
}
