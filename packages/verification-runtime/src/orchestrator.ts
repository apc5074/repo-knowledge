import { randomUUID } from "node:crypto";

import { loadVerificationContract } from "./contract-loader.js";
import { createVerificationDryRunReport } from "./dry-run.js";
import { detectGitChangeSet } from "./git.js";
import { normalizeVerificationChecks } from "./check-normalizer.js";
import { deduplicateVerificationChecks } from "./deduplication.js";
import { orderVerificationChecks } from "./dependency-order.js";
import { resolveVerificationComponentImpact } from "./component-impact.js";
import { resolveVerificationEnvironment } from "./environment.js";
import { runVerificationCommand } from "./command-runner.js";
import {
  createJsonVerificationHistoryStore,
  resolveVerificationHistoryStorePaths
} from "./history-store.js";
import { selectVerificationChecks } from "./selector.js";
import { summarizeVerificationRun } from "./status.js";
import type {
  VerificationPlan,
  VerificationRun,
  VerificationSelectionMode,
  VerificationSummary
} from "./types.js";

export type VerificationOrchestratorInput = {
  readonly repositoryRoot: string;
  readonly contractPath?: string;
  readonly mode?: VerificationSelectionMode;
  readonly dryRun?: boolean;
  readonly baseRef?: string;
  readonly sinceRef?: string;
  readonly all?: boolean;
  readonly changed?: boolean;
  readonly changedPaths?: readonly string[];
  readonly requestedPaths?: readonly string[];
  readonly requestedComponentIds?: readonly string[];
  readonly requestedCheckIds?: readonly string[];
  readonly skippedCheckIds?: readonly string[];
  readonly noDefault?: boolean;
  readonly timeoutSeconds?: number;
  readonly repositoryStateRoot?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
};

export type VerificationOrchestratorResult =
  | {
      readonly ok: true;
      readonly dryRun: boolean;
      readonly exitCode: number;
      readonly plan: VerificationPlan;
      readonly run: VerificationRun;
      readonly dryRunReport?: ReturnType<typeof createVerificationDryRunReport>;
    }
  | {
      readonly ok: false;
      readonly dryRun: boolean;
      readonly exitCode: number;
      readonly plan?: VerificationPlan;
      readonly run?: VerificationRun;
      readonly error: string;
    };

export async function runVerificationOrchestrator(
  input: VerificationOrchestratorInput
): Promise<VerificationOrchestratorResult> {
  const contractResult = await loadVerificationContract({
    repositoryRoot: input.repositoryRoot,
    contractPath: input.contractPath
  });

  if (!contractResult.ok) {
    return {
      ok: false,
      dryRun: input.dryRun ?? false,
      exitCode: 2,
      error: contractResult.message
    };
  }

  const changeSetResult = input.changedPaths
    ? {
        repositoryRoot: input.repositoryRoot,
        baseRef: input.baseRef ?? input.sinceRef ?? "HEAD",
        headRef: "HEAD",
        changedPaths: [...input.changedPaths],
        warnings: []
      }
    : await detectGitChangeSet({
        repositoryRoot: input.repositoryRoot,
        baseRef: input.baseRef ?? input.sinceRef
      });

  const changeSet = {
    mode: input.all === true ? "all" : input.changed === true ? "git" : (input.mode ?? "git"),
    baseRef: changeSetResult?.baseRef ?? "HEAD",
    headRef: changeSetResult?.headRef ?? "HEAD",
    paths: changeSetResult?.changedPaths ?? [],
    changedPaths: changeSetResult?.changedPaths ?? [],
    warnings: changeSetResult?.warnings ?? []
  } as const;
  const selectionMode = changeSet.mode;
  const componentImpact = resolveVerificationComponentImpact({
    contract: contractResult.contract,
    changedPaths: changeSet.changedPaths,
    explicitComponentIds: input.requestedComponentIds
  });
  const normalized = normalizeVerificationChecks({
    mode: selectionMode,
    defaultChecks: contractResult.verification?.default?.map((check) => ({
      ...check,
      command: {
        ...check.command,
        environment: check.command.environment ?? []
      }
    })) as never,
    rules: contractResult.verification?.rules as never
  });
  const selection = selectVerificationChecks({
    mode: selectionMode,
    defaultChecks: normalized.checks.filter((check) => check.source === "default"),
    checks: normalized.checks.filter((check) => check.source !== "default"),
    changeSet,
    requestedPaths: input.requestedPaths,
    requestedComponentIds: componentImpact.impactedComponentIds,
    requestedCheckIds: input.requestedCheckIds,
    noDefault: input.noDefault === true || input.changed === true
  });
  const deduplicated = deduplicateVerificationChecks(selection.selectedChecks);
  const ordered = orderVerificationChecks(deduplicated.checks);
  const skippedCheckIds = new Set(input.skippedCheckIds ?? []);
  const skippedChecks = ordered.checks.filter((check) => skippedCheckIds.has(check.id));
  const selectedChecks = ordered.checks.filter((check) => !skippedCheckIds.has(check.id));
  const environment = resolveVerificationEnvironment({
    contract: contractResult.contract,
    checks: selectedChecks,
    env: input.env
  });

  if (input.dryRun === true) {
    const plan = buildVerificationPlan({
      contractPath: contractResult.path,
      changeSet,
      selectedChecks,
      skippedChecks: skippedChecks.map((check) => ({
        ...check,
        status: "skipped",
        skipReason: "skipped-by-user",
        evidence: []
      })),
      warnings: [
        ...changeSet.warnings,
        ...componentImpact.reasons,
        ...normalized.warnings,
        ...selection.warnings,
        ...deduplicated.warnings,
        ...ordered.warnings,
        ...environment.warnings
      ]
    });
    const run = summarizeVerificationRun(
      createVerificationRun(plan, contractResult.version, environment.errors, []),
      true
    );

    return {
      ok: true,
      dryRun: true,
      exitCode: summarizeVerificationRun(run, true).status === "failed" ? 1 : 0,
      plan,
      run,
      dryRunReport: createVerificationDryRunReport(plan)
    };
  }

  const results = [];
  for (const check of selectedChecks) {
    if (environment.blockedCheckIds.includes(check.id)) {
      results.push({
        id: check.id,
        status: "blocked",
        source: check.source,
        command: check.command,
        selectedBy: check.reason,
        skipReason: "blocked",
        evidence: []
      });
      continue;
    }

    results.push(
      await runVerificationCommand({
        check,
        env: environment.values,
        timeoutSeconds: input.timeoutSeconds
      })
    );
  }

  const plan = buildVerificationPlan({
    contractPath: contractResult.path,
    changeSet,
    selectedChecks,
    skippedChecks: skippedChecks.map((check) => ({
      ...check,
      status: "skipped",
      skipReason: "skipped-by-user",
      evidence: []
    })),
    warnings: [
      ...changeSet.warnings,
      ...componentImpact.reasons,
      ...normalized.warnings,
      ...selection.warnings,
      ...deduplicated.warnings,
      ...ordered.warnings,
      ...environment.warnings
    ]
  });
  const run = summarizeVerificationRun(
    createVerificationRun(plan, contractResult.version, environment.errors, results)
  );
  const history = await persistVerificationRunHistory({
    repositoryStateRoot: input.repositoryStateRoot,
    run
  });

  return {
    ok: true,
    dryRun: false,
    exitCode: run.status === "failed" ? 1 : 0,
    plan,
    run: history.run
  };
}

function buildVerificationPlan(input: {
  readonly contractPath?: string;
  readonly changeSet: VerificationPlan["changeSet"];
  readonly selectedChecks: VerificationPlan["selectedChecks"];
  readonly skippedChecks: VerificationPlan["skippedChecks"];
  readonly warnings: readonly string[];
}): VerificationPlan {
  return {
    mode: input.changeSet.mode,
    contractPath: input.contractPath,
    baseRef: input.changeSet.baseRef,
    headRef: input.changeSet.headRef,
    changeSet: input.changeSet,
    selectedChecks: input.selectedChecks,
    skippedChecks: input.skippedChecks,
    warnings: input.warnings
  };
}

function createVerificationRun(
  plan: VerificationPlan,
  contractVersion: number,
  errors: readonly string[],
  results: readonly unknown[]
): VerificationRun {
  const completedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    runId: `verify_${randomUUID()}`,
    repositoryRoot: ".",
    contractPath: plan.contractPath,
    contractVersion: String(contractVersion),
    startedAt: new Date().toISOString(),
    completedAt,
    status: errors.length > 0 ? "failed" : "passed",
    changeSet: plan.changeSet,
    plan,
    results: results as VerificationRun["results"],
    summary: summarizeVerificationResults(results as VerificationRun["results"]),
    warnings: plan.warnings,
    errors
  };
}

async function persistVerificationRunHistory(input: {
  readonly repositoryStateRoot?: string;
  readonly run: VerificationRun;
}): Promise<{ readonly run: VerificationRun }> {
  if (input.repositoryStateRoot === undefined) {
    return { run: input.run };
  }

  const store = createJsonVerificationHistoryStore(
    resolveVerificationHistoryStorePaths({ repositoryStateRoot: input.repositoryStateRoot })
  );
  await store.ensure();
  await store.writeRun(input.run);

  return { run: input.run };
}

function summarizeVerificationResults(results: VerificationRun["results"]): VerificationSummary {
  return {
    total: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    timedOut: results.filter((result) => result.status === "timed_out").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    blocked: results.filter((result) => result.status === "blocked").length,
    notConfigured: results.filter((result) => result.status === "not_configured").length,
    unknown: results.filter((result) => result.status === "unknown").length
  };
}
