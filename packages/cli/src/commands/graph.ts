import { join } from "node:path";

import {
  buildLocalRepositoryGraph,
  createSqliteRepositoryGraphStore,
  explainGraphTarget,
  formatGraphBuildReport,
  formatGraphExplanationReport,
  formatGraphRelatedReport,
  graphBuildJson,
  graphExplanationJson,
  graphQueryJson,
  graphStatusJson,
  planGraphInvalidation,
  queryGraphRelationships,
  resolveRepositoryGraphStorePaths
} from "@repo-knowledge/repository-graph";

import type { CommandContext } from "../command-context.js";
import { buildCommandResult, buildSuccessResult, type CommandResult } from "../output/result.js";

export async function graphBuildCommand(
  context: CommandContext,
  options: { readonly force?: boolean; readonly changed?: boolean }
): Promise<CommandResult> {
  const root = await context.repositoryRoot();
  if (!root.ok) return missing(context, "graph build", root.message);
  const snapshot = await buildLocalRepositoryGraph({ repositoryRoot: root.root });
  return buildSuccessResult(context, {
    command: "graph build",
    summary: formatGraphBuildReport(snapshot.build),
    data: graphBuildJson(snapshot.build),
    repository: { root: root.root }
  });
}
export async function graphStatusCommand(context: CommandContext): Promise<CommandResult> {
  const root = await context.repositoryRoot();
  if (!root.ok) return missing(context, "graph status", root.message);
  const store = createSqliteRepositoryGraphStore(
    resolveRepositoryGraphStorePaths({ repositoryStateRoot: join(root.root, ".board/state") })
  );
  const build = await store.getLatestBuild().catch(() => undefined);
  const plan = planGraphInvalidation({ currentFingerprints: build ? {} : {} });
  return buildSuccessResult(context, {
    command: "graph status",
    summary: build ? `Graph build ${build.id} is available.` : "No graph build is available.",
    data: { ...graphStatusJson(plan), build },
    warnings: build ? [] : ["Run board graph build first."],
    repository: { root: root.root }
  });
}
export async function graphRelatedCommand(
  context: CommandContext,
  target: string
): Promise<CommandResult> {
  const root = await context.repositoryRoot();
  if (!root.ok) return missing(context, "graph related", root.message);
  const store = createSqliteRepositoryGraphStore(
    resolveRepositoryGraphStorePaths({ repositoryStateRoot: join(root.root, ".board/state") })
  );
  const query = await queryGraphRelationships(store, { target });
  return buildSuccessResult(context, {
    command: "graph related",
    summary: formatGraphRelatedReport(query),
    data: graphQueryJson(query),
    warnings: query.warnings,
    repository: { root: root.root }
  });
}
export async function graphExplainCommand(
  context: CommandContext,
  target: string
): Promise<CommandResult> {
  const root = await context.repositoryRoot();
  if (!root.ok) return missing(context, "graph explain", root.message);
  const store = createSqliteRepositoryGraphStore(
    resolveRepositoryGraphStorePaths({ repositoryStateRoot: join(root.root, ".board/state") })
  );
  const result = await explainGraphTarget(store, target);
  if (!result.ok)
    return buildCommandResult({
      ok: false,
      command: "graph explain",
      summary: result.message,
      errors: [{ code: result.error, message: result.message }],
      session_id: context.sessionId
    });
  return buildSuccessResult(context, {
    command: "graph explain",
    summary: formatGraphExplanationReport(result.explanation),
    data: graphExplanationJson(result.explanation),
    warnings: result.explanation.warnings,
    repository: { root: root.root }
  });
}
function missing(context: CommandContext, command: string, message: string): CommandResult {
  return buildCommandResult({
    ok: false,
    command,
    summary: "Repository root not found.",
    errors: [{ code: "repository-not-found", message }],
    session_id: context.sessionId
  });
}
