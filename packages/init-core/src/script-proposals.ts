import type { ScannerFact } from "@repo-knowledge/scanner-core";

import type { MissingScriptGap } from "./script-gaps.js";

export type ScriptProposal = {
  readonly id: string;
  readonly capability: MissingScriptGap["capability"];
  readonly target: "package.json" | "Makefile" | "justfile" | "scripts/dev";
  readonly suggestedName: string;
  readonly suggestedCommand?: string;
  readonly rationale: string;
  readonly evidence: readonly string[];
  readonly reviewRequired: boolean;
};

export type ScriptProposalResult = {
  readonly proposals: readonly ScriptProposal[];
  readonly inferredFields: readonly string[];
};

export function generateScriptProposals(input: {
  readonly gaps: readonly MissingScriptGap[];
  readonly facts: readonly ScannerFact[];
}): ScriptProposalResult {
  const target = preferredTarget(input.facts);
  const proposals = input.gaps.map((gap) => proposalForGap(gap, target, input.facts));

  return {
    proposals,
    inferredFields: proposals.length > 0 ? ["script_proposals"] : []
  };
}

function proposalForGap(
  gap: MissingScriptGap,
  target: ScriptProposal["target"],
  facts: readonly ScannerFact[]
): ScriptProposal {
  const suggested = suggestedCommand(gap.capability, facts);

  return {
    id: `script-proposal-${gap.capability}`,
    capability: gap.capability,
    target,
    suggestedName: suggested.name,
    suggestedCommand: suggested.command,
    rationale: suggested.command
      ? `${gap.recommendation} This proposal is inferred from detected repository conventions.`
      : `${gap.recommendation} No safe command body could be inferred yet.`,
    evidence: evidencePaths(facts),
    reviewRequired: true
  };
}

function preferredTarget(facts: readonly ScannerFact[]): ScriptProposal["target"] {
  if (facts.some((fact) => fact.detector.includes("makefile"))) {
    return "Makefile";
  }

  if (facts.some((fact) => fact.detector.includes("javascript"))) {
    return "package.json";
  }

  if (facts.some((fact) => fact.detector.includes("python"))) {
    return "Makefile";
  }

  return "scripts/dev";
}

function suggestedCommand(
  capability: MissingScriptGap["capability"],
  facts: readonly ScannerFact[]
): { readonly name: string; readonly command?: string } {
  const packageManager = detectedPackageManager(facts);

  if (capability === "install") {
    return {
      name: "install",
      command: packageManager ? `${packageManager} install` : undefined
    };
  }

  if (capability === "stop" && hasCompose(facts)) {
    return {
      name: "stop",
      command: "docker compose down"
    };
  }

  if (capability === "verify") {
    const parts = ["typecheck", "lint", "test"].filter((part) => hasCommandCategory(facts, part));
    return {
      name: "verify",
      command:
        parts.length > 0 && packageManager
          ? parts.map((part) => `${packageManager} run ${part}`).join(" && ")
          : undefined
    };
  }

  return {
    name: capability
  };
}

function detectedPackageManager(facts: readonly ScannerFact[]): string | undefined {
  return facts
    .filter((fact) => fact.kind === "package_manager.detected")
    .map((fact) => fact.value as Record<string, unknown>)
    .map((value) => (typeof value.name === "string" ? value.name : undefined))
    .find((name): name is string => name !== undefined);
}

function hasCompose(facts: readonly ScannerFact[]): boolean {
  return facts.some((fact) => fact.kind === "compose.file_detected");
}

function hasCommandCategory(facts: readonly ScannerFact[], category: string): boolean {
  return facts.some((fact) => {
    if (fact.kind !== "command.detected") {
      return false;
    }

    const value = fact.value as Record<string, unknown>;
    return value.category === category;
  });
}

function evidencePaths(facts: readonly ScannerFact[]): readonly string[] {
  return [
    ...new Set(
      facts
        .flatMap((fact) => fact.evidence)
        .map((evidence) => evidence.source_path)
        .filter((path): path is string => path !== undefined)
    )
  ].sort();
}
