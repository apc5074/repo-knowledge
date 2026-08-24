import {
  findingTargetIds,
  fingerprintFinding,
  normalizeFindingMessage
} from "./known-problem-store.js";
import type { DiagnosticFinding, KnownProblemMatch, KnownProblemRecord } from "./types.js";

export type MatchKnownProblemsInput = {
  readonly findings: readonly DiagnosticFinding[];
  readonly knownProblems: readonly KnownProblemRecord[];
};

export function matchKnownProblems(input: MatchKnownProblemsInput): readonly KnownProblemMatch[] {
  return input.findings.flatMap((finding) =>
    input.knownProblems.flatMap((problem) => matchFinding(finding, problem))
  );
}

export function attachKnownProblemMatches(
  findings: readonly DiagnosticFinding[],
  matches: readonly KnownProblemMatch[]
): readonly DiagnosticFinding[] {
  return findings.map((finding) => {
    const matchedIds = matches
      .filter((match) => match.findingId === finding.id)
      .map((match) => match.knownProblemId);

    if (matchedIds.length === 0) {
      return finding;
    }

    return {
      ...finding,
      status: "matched_known_problem",
      matchedKnownProblemIds: [...new Set([...finding.matchedKnownProblemIds, ...matchedIds])]
    };
  });
}

function matchFinding(
  finding: DiagnosticFinding,
  problem: KnownProblemRecord
): readonly KnownProblemMatch[] {
  const matchedOn: string[] = [];
  const findingFingerprint = fingerprintFinding(finding);
  const findingTargets = findingTargetIds(finding);
  const problemTargets = new Set(problem.targetIds ?? []);

  if (findingFingerprint === problem.fingerprint) {
    matchedOn.push("fingerprint");
  }

  if (finding.category === problem.category) {
    matchedOn.push("category");
  }

  if (problem.notes?.includes(`rule:${finding.ruleId}`) === true) {
    matchedOn.push("ruleId");
  }

  if (findingTargets.some((target) => problemTargets.has(target))) {
    matchedOn.push("target");
  }

  if (normalizeFindingMessage(finding.title) === normalizeFindingMessage(problem.title)) {
    matchedOn.push("normalizedMessage");
  }

  const strongMatch =
    matchedOn.includes("fingerprint") ||
    (matchedOn.includes("category") &&
      matchedOn.includes("target") &&
      matchedOn.includes("normalizedMessage"));

  if (!strongMatch) {
    return [];
  }

  return [
    {
      knownProblemId: problem.id,
      findingId: finding.id,
      confidence: matchedOn.includes("fingerprint") ? "confirmed" : "high",
      matchedOn,
      evidence: finding.evidence
    }
  ];
}
