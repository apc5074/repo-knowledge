import type { ScannerFact } from "@repo-knowledge/scanner-core";

import { stableLegacyCandidateId, type LegacyCandidateStore } from "./legacy-candidate-store.js";
import type { DiagnosticEvidence, LegacyCandidateRecord } from "./types.js";

export type StaleWorkflowMatchInput = {
  readonly facts: readonly ScannerFact[];
  readonly activeCommands: readonly string[];
  readonly store?: LegacyCandidateStore;
  readonly detectedAt?: string;
  readonly replacementHints?: Readonly<Record<string, string>>;
};

export type StaleWorkflowMatchResult = {
  readonly candidates: readonly LegacyCandidateRecord[];
  readonly warnings: readonly string[];
};

export async function matchStaleWorkflowCandidates(
  input: StaleWorkflowMatchInput
): Promise<StaleWorkflowMatchResult> {
  const activeCommands = new Set(input.activeCommands.map(normalizeCommandName));
  const candidates = input.facts
    .filter(
      (fact) =>
        fact.kind === "command.detected" || fact.kind === "legacy.command_candidate_detected"
    )
    .flatMap((fact) => candidateFromCommandFact(fact, activeCommands, input));
  const stored =
    input.store === undefined
      ? candidates
      : await Promise.all(candidates.map((candidate) => input.store?.upsert(candidate)));

  return {
    candidates: stored.filter(
      (candidate): candidate is LegacyCandidateRecord => candidate !== undefined
    ),
    warnings: []
  };
}

function candidateFromCommandFact(
  fact: ScannerFact,
  activeCommands: ReadonlySet<string>,
  input: StaleWorkflowMatchInput
): readonly LegacyCandidateRecord[] {
  const value = fact.value as Record<string, unknown>;
  const command = stringValue(value.command);

  if (command === undefined || isManualOrExternal(value)) {
    return [];
  }

  const commandName = normalizeCommandName(command);
  const legacySignal =
    fact.kind === "legacy.command_candidate_detected" || /legacy|old|deprecated|v1/i.test(command);
  const missingTarget =
    /(?:^|\s)(?:node|tsx?|python|python3)\s+([^\s]+\.(?:ts|tsx|js|jsx|py))/i.exec(command)?.[1];
  const stale = !activeCommands.has(commandName) || legacySignal || missingTarget !== undefined;

  if (!stale) {
    return [];
  }

  const detectedAt = input.detectedAt ?? new Date().toISOString();
  const target = {
    kind: "command" as const,
    value: command
  };

  return [
    {
      id: stableLegacyCandidateId(target),
      target,
      signalTypes: [fact.kind],
      confidence: legacySignal || missingTarget !== undefined ? "medium" : "low",
      status: "unreviewed",
      detectedAt,
      updatedAt: detectedAt,
      evidence: fact.evidence.map((evidence) => ({
        kind: evidence.kind === "documentation" ? "file" : "scanner_fact",
        summary: `${fact.kind} command ${command}`,
        path: evidence.source_path,
        line: evidence.line_start,
        command,
        metadata: {
          factId: fact.id,
          detector: fact.detector
        }
      })) satisfies readonly DiagnosticEvidence[],
      counterEvidence:
        missingTarget === undefined
          ? []
          : [
              {
                kind: "file",
                summary: `Command references path ${missingTarget}; verify whether it still exists before changing workflow instructions.`,
                path: missingTarget
              }
            ],
      replacementHints:
        input.replacementHints?.[commandName] === undefined
          ? []
          : [input.replacementHints[commandName]],
      suggestedReviewAction: "Review this workflow candidate before editing scripts or docs.",
      scannerFactIds: [fact.id]
    }
  ];
}

function isManualOrExternal(value: Record<string, unknown>): boolean {
  const text =
    `${stringValue(value.source) ?? ""} ${stringValue(value.signal) ?? ""} ${stringValue(value.category) ?? ""}`.toLowerCase();
  return text.includes("manual") || text.includes("external");
}

function normalizeCommandName(command: string): string {
  const first = command.trim().split(/\s+/)[0] ?? command;
  const parts = first.split(/[\\/]/);
  return parts[parts.length - 1] ?? first;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
