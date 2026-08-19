import type { ScannerFact } from "@repo-knowledge/scanner-core";

import { commandFacts, type CommandFactRecord } from "./commands.js";
import type { InitReviewItem } from "./result.js";

export type MissingScriptCapability =
  | "install"
  | "start"
  | "stop"
  | "migrate"
  | "seed"
  | "healthcheck"
  | "verify"
  | "test"
  | "lint"
  | "typecheck";

export type MissingScriptGap = {
  readonly capability: MissingScriptCapability;
  readonly title: string;
  readonly summary: string;
  readonly recommendation: string;
};

export type MissingScriptDetectionResult = {
  readonly gaps: readonly MissingScriptGap[];
  readonly reviewItems: readonly InitReviewItem[];
  readonly inferredFields: readonly string[];
};

const requiredCapabilities: readonly MissingScriptCapability[] = [
  "install",
  "start",
  "stop",
  "migrate",
  "seed",
  "healthcheck",
  "verify",
  "test",
  "lint",
  "typecheck"
];

export function detectMissingDevelopmentScripts(
  facts: readonly ScannerFact[]
): MissingScriptDetectionResult {
  const commands = commandFacts(facts);
  const present = new Set(commands.flatMap(commandCapabilities));
  const gaps = requiredCapabilities
    .filter((capability) => !present.has(capability))
    .map((capability) => gapFor(capability));

  return {
    gaps,
    reviewItems: gaps.map((gap) => ({
      id: `missing-script-${gap.capability}`,
      kind: "missing-evidence",
      title: gap.title,
      summary: gap.summary
    })),
    inferredFields: gaps.length > 0 ? ["script_gaps"] : []
  };
}

function commandCapabilities(record: CommandFactRecord): readonly MissingScriptCapability[] {
  const category = record.category;
  const name = record.name.toLowerCase();
  const command = record.command.toLowerCase();
  const capabilities: MissingScriptCapability[] = [];

  if (["install", "setup", "bootstrap"].includes(category ?? "") || /\binstall\b/.test(name)) {
    capabilities.push("install");
  }

  if (category === "development" || category === "start" || /\b(dev|start|serve)\b/.test(name)) {
    capabilities.push("start");
  }

  if (/\bstop\b/.test(name) || /\bdown\b/.test(name) || /\bdocker compose down\b/.test(command)) {
    capabilities.push("stop");
  }

  if (category === "migration" || /\bmigrat/.test(name)) {
    capabilities.push("migrate");
  }

  if (category === "seed" || /\bseed\b/.test(name)) {
    capabilities.push("seed");
  }

  if (category === "healthcheck" || /\bhealth/.test(name)) {
    capabilities.push("healthcheck");
  }

  if (category === "verification" || /\bverify\b/.test(name)) {
    capabilities.push("verify");
  }

  if (category === "test") {
    capabilities.push("test");
  }

  if (category === "lint") {
    capabilities.push("lint");
  }

  if (category === "typecheck") {
    capabilities.push("typecheck");
  }

  return capabilities;
}

function gapFor(capability: MissingScriptCapability): MissingScriptGap {
  return {
    capability,
    title: `Missing ${capability} script`,
    summary: `No verified ${capability} command was detected in repository scripts, task files, or CI facts.`,
    recommendation: `Add or document a ${capability} command before relying on automated local readiness workflows.`
  };
}
