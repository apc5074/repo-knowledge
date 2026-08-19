import type { CommandStep } from "@repo-knowledge/repository-contract";
import type { ScannerFact } from "@repo-knowledge/scanner-core";

import { stableId } from "./applications.js";
import { scannerFactEvidence } from "./evidence.js";
import type { InitReviewItem } from "./result.js";

export type CommandFactRecord = {
  readonly fact: ScannerFact;
  readonly name: string;
  readonly command: string;
  readonly category?: string;
  readonly cwd: string;
};

type FactRecord = Record<string, unknown>;

export function commandFacts(facts: readonly ScannerFact[]): readonly CommandFactRecord[] {
  return facts
    .filter((fact) => fact.kind === "command.detected" && fact.confidence !== "low")
    .map((fact): CommandFactRecord | undefined => {
      const value = fact.value as FactRecord;
      const command = stringValue(value.command);

      if (!command) {
        return undefined;
      }

      return {
        fact,
        name: stringValue(value.name) ?? command,
        command,
        category: stringValue(value.category),
        cwd: stringValue(value.cwd) ?? "."
      };
    })
    .filter((record): record is CommandFactRecord => record !== undefined);
}

export function commandStep(record: CommandFactRecord, idHint: string): CommandStep {
  return {
    id: stableId(idHint),
    command: record.command,
    working_directory: record.cwd,
    evidence: [...scannerFactEvidence(record.fact)]
  };
}

export function selectBestCommand(
  records: readonly CommandFactRecord[],
  categories: readonly string[],
  reviewItems: InitReviewItem[],
  reviewIdPrefix: string
): CommandFactRecord | undefined {
  const matches = records
    .filter((record) => record.category !== undefined && categories.includes(record.category))
    .sort(commandRecordCompare);
  const best = matches[0];

  for (const alternative of matches.slice(1)) {
    reviewItems.push({
      id: `${reviewIdPrefix}-${stableId(alternative.cwd)}-${stableId(alternative.name)}`,
      kind: "confirmation-required",
      title: "Alternative command needs review",
      summary: `Alternative ${alternative.category ?? "command"} command was detected but not selected: ${alternative.command}`,
      evidence: alternative.fact.evidence.map((evidence) => evidence.source_path)
    });
  }

  return best;
}

export function dedupeCommands(
  records: readonly CommandFactRecord[]
): readonly CommandFactRecord[] {
  const seen = new Set<string>();
  const deduped: CommandFactRecord[] = [];

  for (const record of [...records].sort(commandRecordCompare)) {
    const key = `${record.category ?? "custom"}:${record.cwd}:${record.command}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(record);
  }

  return deduped;
}

function commandRecordCompare(left: CommandFactRecord, right: CommandFactRecord): number {
  return (
    confidenceRank(right.fact.confidence) - confidenceRank(left.fact.confidence) ||
    sourceRank(left.fact.detector) - sourceRank(right.fact.detector) ||
    left.cwd.localeCompare(right.cwd) ||
    left.command.localeCompare(right.command)
  );
}

function confidenceRank(confidence: ScannerFact["confidence"]): number {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

function sourceRank(detector: string): number {
  if (detector.includes("javascript-command") || detector.includes("python-command")) {
    return 0;
  }

  if (detector.includes("makefile")) {
    return 1;
  }

  if (detector.includes("github-actions")) {
    return 2;
  }

  return 3;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
