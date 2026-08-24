import {
  diagnosticCategories,
  formatHumanDoctorReport,
  runDoctor,
  serializeDoctorToJson,
  type DiagnosticCategory
} from "@repo-knowledge/doctor-runtime";

import type { CommandContext } from "../command-context.js";
import { usageError } from "../errors/board-error.js";
import { buildFailureResult, buildSuccessResult, type CommandResult } from "../output/result.js";

export type DoctorCommandOptions = {
  readonly category?: readonly string[];
  readonly includeLogs?: boolean;
  readonly runtime?: boolean;
  readonly docker?: boolean;
  readonly history?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
};

export async function doctorCommand(
  context: CommandContext,
  options: DoctorCommandOptions = {}
): Promise<CommandResult> {
  const categories = normalizeCategories(options.category ?? []);
  const repositoryRoot = await context.repositoryRoot();

  if (!repositoryRoot.ok) {
    return buildFailureResult(context, {
      command: "doctor",
      summary: repositoryRoot.message,
      errors: [{ code: repositoryRoot.reason, message: repositoryRoot.message }],
      next_steps: ["Run board doctor from a Git repository or pass --cwd to a repository path."]
    });
  }

  const [contractPath, localState] = await Promise.all([
    context.contractPath(),
    context.localState()
  ]);
  const disabledInspectors = [
    ...(options.runtime === false ? ["runtime" as const, "ports" as const] : []),
    ...(options.docker === false ? ["docker" as const] : []),
    ...(options.history === false ? ["verification" as const] : [])
  ];
  const result = await runDoctor({
    repositoryRoot: repositoryRoot.root,
    contractPath: contractPath.ok ? contractPath.path : contractPath.attemptedPath,
    repositoryStateRoot: localState.repositoryStateRoot,
    categories,
    includeLogs: options.includeLogs,
    disabledInspectors,
    dryRun: options.dryRun,
    env: context.env
  });
  const human = formatHumanDoctorReport(result.report, {
    includeLogs: options.includeLogs,
    runRecordPath: result.statePaths?.run
  });
  const json = serializeDoctorToJson({
    report: result.report,
    statePaths: result.statePaths,
    enabledInspectors: result.enabledInspectors,
    skippedInspectors: result.skippedInspectors
  });

  return buildSuccessResult(context, {
    command: "doctor",
    status: result.report.run.findings.length > 0 ? "warning" : "success",
    summary: context.outputMode === "json" ? human.summary : human.human,
    data: {
      doctor: context.outputMode === "json" ? json : result.report,
      skipped_inspectors: result.skippedInspectors
    },
    warnings: result.report.run.warnings,
    next_steps: result.report.nextSteps,
    repository: {
      root: result.report.run.repositoryRoot
    },
    contract: {
      path: result.report.run.contractPath,
      valid: result.report.run.findings.every(
        (finding) =>
          finding.ruleId !== "contract.loader-findings" || finding.severity !== "blocking"
      )
    },
    candidate_findings: result.report.run.legacyCandidates.map((candidate) => ({
      id: candidate.id,
      kind: "legacy",
      title: `${candidate.target.kind}: ${candidate.target.value}`,
      summary: candidate.suggestedReviewAction,
      evidence: candidate.evidence.map((evidence) => evidence.summary)
    }))
  });
}

function normalizeCategories(values: readonly string[]): readonly DiagnosticCategory[] | undefined {
  const categories = values.flatMap((value) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );

  if (categories.length === 0) {
    return undefined;
  }

  const validCategories = new Set<string>(diagnosticCategories);
  const invalid = categories.filter((category) => !validCategories.has(category));

  if (invalid.length > 0) {
    throw usageError(`Unknown doctor category: ${invalid.join(", ")}`, [
      `Use one of: ${diagnosticCategories.join(", ")}.`
    ]);
  }

  return [...new Set(categories)] as readonly DiagnosticCategory[];
}
