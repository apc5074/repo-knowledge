import type {
  DiagnosticCategory,
  DiagnosticFinding,
  DiagnosticSeverity,
  DoctorReport,
  DoctorRun
} from "./types.js";

export type HumanDoctorReportOptions = {
  readonly includeLogs?: boolean;
  readonly runRecordPath?: string;
};

export type HumanDoctorReport = {
  readonly summary: string;
  readonly human: string;
};

const severityOrder: readonly DiagnosticSeverity[] = ["blocking", "error", "warning", "info"];
const categoryOrder: readonly DiagnosticCategory[] = [
  "environment",
  "runtime",
  "docker",
  "ports",
  "verification",
  "contract",
  "docs",
  "legacy"
];

export function formatHumanDoctorReport(
  report: DoctorReport | DoctorRun,
  options: HumanDoctorReportOptions = {}
): HumanDoctorReport {
  const run = "run" in report ? report.run : report;
  const matches = "run" in report ? report.run.knownProblemMatches : run.knownProblemMatches;
  const summary =
    run.findings.length === 0
      ? `Doctor found no local problems for ${run.runId}.`
      : `Doctor found ${run.findings.length} finding(s): ${run.summary.bySeverity.blocking} blocking, ${run.summary.bySeverity.error} error, ${run.summary.bySeverity.warning} warning.`;
  const lines = [summary];

  for (const severity of severityOrder) {
    const findings = run.findings.filter((finding) => finding.severity === severity);

    if (findings.length === 0) {
      continue;
    }

    lines.push(`${titleCase(severity)}:`);
    for (const finding of findings.sort(compareFindings)) {
      lines.push(`  [${finding.category}] ${finding.title}`);
      lines.push(`    ${finding.summary}`);

      if (finding.matchedKnownProblemIds.length > 0) {
        lines.push(`    Known problem: ${finding.matchedKnownProblemIds.join(", ")}`);
      }

      if (finding.kind === "inferred_candidate" || finding.category === "legacy") {
        lines.push("    Candidate only; review before changing source.");
      }

      if (finding.suggestedNextSteps[0] !== undefined) {
        lines.push(`    Next: ${finding.suggestedNextSteps[0]}`);
      }

      if (options.includeLogs === true) {
        lines.push(...logLines(finding));
      }
    }
  }

  if (matches.length > 0) {
    lines.push("Known Problem Matches:");
    for (const match of matches) {
      lines.push(`  ${match.findingId} -> ${match.knownProblemId} (${match.matchedOn.join(", ")})`);
    }
  }

  if (run.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of run.warnings) {
      lines.push(`  ${warning}`);
    }
  }

  if (options.runRecordPath !== undefined) {
    lines.push(`Run record: ${options.runRecordPath}`);
  }

  return {
    summary,
    human: lines.join("\n")
  };
}

function compareFindings(left: DiagnosticFinding, right: DiagnosticFinding): number {
  return (
    categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category) ||
    left.title.localeCompare(right.title)
  );
}

function logLines(finding: DiagnosticFinding): readonly string[] {
  return finding.evidence.flatMap((evidence) => {
    if (evidence.excerpt === undefined) {
      return [];
    }

    return [
      `    Log (${evidence.excerpt.truncated ? "truncated" : "bounded"}): ${evidence.excerpt.text}`
    ];
  });
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
