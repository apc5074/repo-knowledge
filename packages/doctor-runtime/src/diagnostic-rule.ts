import type {
  DiagnosticCategory,
  DiagnosticConfidence,
  DiagnosticEvidence,
  DiagnosticFinding,
  DiagnosticSeverity
} from "./types.js";
import type { DockerInspection } from "./docker-inspector.js";
import type { DoctorRepositoryContext } from "./contract-loader.js";
import type { LocalEnvironmentInspection } from "./local-environment.js";
import type { PortInspection } from "./port-inspector.js";
import type { RuntimeSessionInspection } from "./runtime-inspector.js";
import type { VerificationHistoryInspection } from "./verification-inspector.js";

export type DiagnosticRuleContext = {
  readonly repository: DoctorRepositoryContext;
  readonly repositoryInventory?: RepositoryReferenceInventory;
  readonly localEnvironment?: LocalEnvironmentInspection;
  readonly runtime?: RuntimeSessionInspection;
  readonly docker?: DockerInspection;
  readonly ports?: PortInspection;
  readonly verification?: VerificationHistoryInspection;
};

export type RepositoryReferenceInventory = {
  readonly paths: readonly string[];
  readonly commands: readonly string[];
  readonly documentationReferences?: readonly RepositoryReference[];
  readonly agentInstructionReferences?: readonly RepositoryReference[];
};

export type RepositoryReference = {
  readonly sourcePath: string;
  readonly kind: "path" | "command" | "package";
  readonly value: string;
  readonly line?: number;
};

export type DiagnosticRulePrerequisite =
  | "contract"
  | "repository-inventory"
  | "local-environment"
  | "runtime"
  | "docker"
  | "ports"
  | "verification";

export type DiagnosticRule = {
  readonly id: string;
  readonly category: DiagnosticCategory;
  readonly description: string;
  readonly prerequisites: readonly DiagnosticRulePrerequisite[];
  readonly run: (context: DiagnosticRuleContext) => DiagnosticRuleRunResult;
};

export type DiagnosticRuleSkip = {
  readonly ruleId: string;
  readonly reason: string;
};

export type DiagnosticRuleWarning = {
  readonly ruleId: string;
  readonly message: string;
};

export type DiagnosticRuleRunResult = {
  readonly findings: readonly DiagnosticFinding[];
  readonly skipped?: DiagnosticRuleSkip;
  readonly warnings: readonly DiagnosticRuleWarning[];
};

export type DiagnosticRuleExecutionResult = {
  readonly findings: readonly DiagnosticFinding[];
  readonly skipped: readonly DiagnosticRuleSkip[];
  readonly warnings: readonly DiagnosticRuleWarning[];
};

export type RunDiagnosticRulesInput = {
  readonly rules: readonly DiagnosticRule[];
  readonly context: DiagnosticRuleContext;
  readonly categories?: readonly DiagnosticCategory[];
};

export function runDiagnosticRules(input: RunDiagnosticRulesInput): DiagnosticRuleExecutionResult {
  const categories = input.categories === undefined ? undefined : new Set(input.categories);
  const selectedRules = input.rules.filter(
    (rule) => categories === undefined || categories.has(rule.category)
  );
  const results = selectedRules.map((rule) => runRule(rule, input.context));

  return {
    findings: results.flatMap((result) => result.findings),
    skipped: results.flatMap((result) => (result.skipped === undefined ? [] : [result.skipped])),
    warnings: results.flatMap((result) => result.warnings)
  };
}

export function createDiagnosticFinding(input: {
  readonly id: string;
  readonly ruleId: string;
  readonly category: DiagnosticCategory;
  readonly severity: DiagnosticSeverity;
  readonly confidence: DiagnosticConfidence;
  readonly title: string;
  readonly summary: string;
  readonly evidence?: readonly DiagnosticEvidence[];
  readonly counterEvidence?: readonly DiagnosticEvidence[];
  readonly suggestedNextSteps?: readonly string[];
}): DiagnosticFinding {
  return {
    id: input.id,
    ruleId: input.ruleId,
    category: input.category,
    kind:
      input.counterEvidence !== undefined && input.counterEvidence.length > 0
        ? "inferred_candidate"
        : "direct_local_fact",
    severity: input.severity,
    confidence: input.confidence,
    status: "open",
    title: input.title,
    summary: input.summary,
    evidence: input.evidence ?? [],
    counterEvidence: input.counterEvidence ?? [],
    suggestedNextSteps: input.suggestedNextSteps ?? [],
    matchedKnownProblemIds: []
  };
}

function runRule(rule: DiagnosticRule, context: DiagnosticRuleContext): DiagnosticRuleRunResult {
  const missing = rule.prerequisites.filter(
    (prerequisite) => !hasPrerequisite(context, prerequisite)
  );

  if (missing.length > 0) {
    return {
      findings: [],
      skipped: {
        ruleId: rule.id,
        reason: `Missing prerequisite: ${missing.join(", ")}`
      },
      warnings: []
    };
  }

  return rule.run(context);
}

function hasPrerequisite(
  context: DiagnosticRuleContext,
  prerequisite: DiagnosticRulePrerequisite
): boolean {
  if (prerequisite === "contract") {
    return context.repository.contract !== undefined;
  }

  if (prerequisite === "local-environment") {
    return context.localEnvironment !== undefined;
  }

  if (prerequisite === "repository-inventory") {
    return context.repositoryInventory !== undefined;
  }

  if (prerequisite === "runtime") {
    return context.runtime !== undefined;
  }

  if (prerequisite === "docker") {
    return context.docker !== undefined;
  }

  if (prerequisite === "ports") {
    return context.ports !== undefined;
  }

  return context.verification !== undefined;
}
