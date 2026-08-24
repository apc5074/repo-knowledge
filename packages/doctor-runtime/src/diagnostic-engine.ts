import { randomUUID } from "node:crypto";

import {
  runDiagnosticRules,
  type DiagnosticRule,
  type DiagnosticRuleContext,
  type DiagnosticRuleExecutionResult,
  type RepositoryReferenceInventory
} from "./diagnostic-rule.js";
import type { DockerInspection } from "./docker-inspector.js";
import type { DoctorRepositoryContext } from "./contract-loader.js";
import type { LocalEnvironmentInspection } from "./local-environment.js";
import type { PortInspection } from "./port-inspector.js";
import type { RuntimeSessionInspection } from "./runtime-inspector.js";
import type {
  DiagnosticCategory,
  DiagnosticFinding,
  DiagnosticSeverity,
  DoctorRun,
  LegacyCandidateRecord
} from "./types.js";
import type { VerificationHistoryInspection } from "./verification-inspector.js";

export type DiagnosticInspectorName =
  "local-environment" | "runtime" | "docker" | "ports" | "verification" | "repository-inventory";

export type DiagnosticInspectorOutput = {
  readonly context: Partial<{
    readonly repositoryInventory: RepositoryReferenceInventory;
    readonly localEnvironment: LocalEnvironmentInspection;
    readonly runtime: RuntimeSessionInspection;
    readonly docker: DockerInspection;
    readonly ports: PortInspection;
    readonly verification: VerificationHistoryInspection;
  }>;
  readonly warnings?: readonly string[];
};

export type DiagnosticInspector = {
  readonly name: DiagnosticInspectorName;
  readonly run: (context: DiagnosticRuleContext) => Promise<DiagnosticInspectorOutput>;
};

export type RunDiagnosticEngineInput = {
  readonly repository: DoctorRepositoryContext;
  readonly rules: readonly DiagnosticRule[];
  readonly inspectors?: readonly DiagnosticInspector[];
  readonly categories?: readonly DiagnosticCategory[];
  readonly disabledInspectors?: readonly DiagnosticInspectorName[];
  readonly dryRun?: boolean;
  readonly runId?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
};

export type DiagnosticEngineResult = {
  readonly run: DoctorRun;
  readonly ruleResult: DiagnosticRuleExecutionResult;
  readonly context: DiagnosticRuleContext;
  readonly skippedInspectors: readonly {
    readonly name: DiagnosticInspectorName;
    readonly reason: string;
  }[];
};

export async function runDiagnosticEngine(
  input: RunDiagnosticEngineInput
): Promise<DiagnosticEngineResult> {
  const startedAt = input.startedAt ?? new Date().toISOString();
  let context: DiagnosticRuleContext = {
    repository: input.repository
  };
  const warnings: string[] = [...input.repository.warnings];
  const errors: string[] = [];
  const skippedInspectors: DiagnosticEngineResult["skippedInspectors"][number][] = [];
  const disabledInspectors = new Set(input.disabledInspectors ?? []);

  if (input.dryRun === true) {
    skippedInspectors.push(
      ...(input.inspectors ?? []).map((inspector) => ({
        name: inspector.name,
        reason: "dry-run"
      }))
    );
  } else {
    for (const inspector of input.inspectors ?? []) {
      if (disabledInspectors.has(inspector.name)) {
        skippedInspectors.push({
          name: inspector.name,
          reason: "disabled"
        });
        continue;
      }

      try {
        const output = await inspector.run(context);
        context = {
          ...context,
          ...output.context
        };
        warnings.push(...(output.warnings ?? []));
      } catch (error) {
        warnings.push(
          `Inspector ${inspector.name} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  const ruleResult =
    input.dryRun === true
      ? { findings: [], skipped: [], warnings: [] }
      : runDiagnosticRules({
          rules: input.rules,
          context,
          categories: input.categories
        });
  const findings = [...input.repository.findings, ...ruleResult.findings];
  warnings.push(...ruleResult.warnings.map((warning) => `${warning.ruleId}: ${warning.message}`));
  warnings.push(...ruleResult.skipped.map((skip) => `Rule ${skip.ruleId} skipped: ${skip.reason}`));

  const run = {
    schemaVersion: 1,
    runId: input.runId ?? randomUUID(),
    repositoryRoot: input.repository.repositoryRoot,
    contractPath: input.repository.contractPath,
    contractVersion:
      input.repository.contractVersion === undefined
        ? undefined
        : String(input.repository.contractVersion),
    startedAt,
    completedAt: input.completedAt ?? new Date().toISOString(),
    categories: input.categories ?? allCategoriesFromFindings(findings),
    findings,
    knownProblemMatches: [],
    legacyCandidates: [] satisfies readonly LegacyCandidateRecord[],
    warnings,
    errors,
    summary: summarizeFindings(findings)
  } satisfies DoctorRun;

  return {
    run,
    ruleResult,
    context,
    skippedInspectors
  };
}

function summarizeFindings(findings: readonly DiagnosticFinding[]): DoctorRun["summary"] {
  return {
    totalFindings: findings.length,
    bySeverity: {
      info: countBy(findings, "severity", "info"),
      warning: countBy(findings, "severity", "warning"),
      error: countBy(findings, "severity", "error"),
      blocking: countBy(findings, "severity", "blocking")
    },
    byCategory: {
      environment: countBy(findings, "category", "environment"),
      runtime: countBy(findings, "category", "runtime"),
      docker: countBy(findings, "category", "docker"),
      ports: countBy(findings, "category", "ports"),
      verification: countBy(findings, "category", "verification"),
      contract: countBy(findings, "category", "contract"),
      docs: countBy(findings, "category", "docs"),
      legacy: countBy(findings, "category", "legacy")
    },
    directLocalFacts: findings.filter((finding) => finding.kind === "direct_local_fact").length,
    inferredCandidates: findings.filter((finding) => finding.kind === "inferred_candidate").length
  };
}

function countBy<TKey extends "severity" | "category">(
  findings: readonly DiagnosticFinding[],
  key: TKey,
  value: TKey extends "severity" ? DiagnosticSeverity : DiagnosticCategory
): number {
  return findings.filter((finding) => finding[key] === value).length;
}

function allCategoriesFromFindings(
  findings: readonly DiagnosticFinding[]
): readonly DiagnosticCategory[] {
  return [...new Set(findings.map((finding) => finding.category))].sort();
}
