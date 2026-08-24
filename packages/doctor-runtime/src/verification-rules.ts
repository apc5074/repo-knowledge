import type { RepositoryContract, VerificationCheck } from "@repo-knowledge/repository-contract";

import { createDiagnosticFinding, type DiagnosticRule } from "./diagnostic-rule.js";
import type { VerificationObservation } from "./verification-inspector.js";
import type { DiagnosticFinding } from "./types.js";

export function createVerificationDiagnosticRules(): readonly DiagnosticRule[] {
  return [verificationObservationRule, verificationStaleConfigRule];
}

export const verificationObservationRule: DiagnosticRule = {
  id: "verification.observations",
  category: "verification",
  description: "Diagnose recent verification failures and skipped or blocked checks.",
  prerequisites: ["verification"],
  run: (context) => ({
    findings:
      context.verification?.observations.map((observation) =>
        findingForVerificationObservation(observation)
      ) ?? [],
    warnings: []
  })
};

export const verificationStaleConfigRule: DiagnosticRule = {
  id: "verification.stale-config",
  category: "verification",
  description: "Detect verification rules that reference missing paths or components.",
  prerequisites: ["contract", "repository-inventory"],
  run: (context) => {
    const contract = context.repository.contract;
    const inventory = context.repositoryInventory;

    return {
      findings:
        contract === undefined || inventory === undefined
          ? []
          : [
              ...missingVerificationPathFindings(contract, inventory.paths),
              ...missingVerificationComponentFindings(contract, context.repository.componentIds)
            ],
      warnings: []
    };
  }
};

function findingForVerificationObservation(
  observation: VerificationObservation
): DiagnosticFinding {
  return createDiagnosticFinding({
    id: `verification.${observation.kind}.${sanitizeId(observation.checkId)}`,
    ruleId: verificationObservationRule.id,
    category: "verification",
    severity: severityForObservation(observation),
    confidence: observation.kind === "repeated_failure" ? "high" : "confirmed",
    title: titleForObservation(observation),
    summary: observation.summary,
    evidence: [
      {
        kind: "verification_run",
        summary: observation.summary,
        runId: observation.runIds[0],
        command: observation.command,
        metadata: {
          kind: observation.kind,
          checkId: observation.checkId,
          count: observation.count,
          runIds: observation.runIds.join(","),
          ...(observation.status === undefined ? {} : { status: observation.status })
        }
      }
    ],
    counterEvidence:
      observation.kind === "repeated_failure"
        ? [
            {
              kind: "verification_run",
              summary: "Repeated verification grouping is based on local history only.",
              runId: observation.runIds[0]
            }
          ]
        : [],
    suggestedNextSteps: [nextStepForObservation(observation)]
  });
}

function missingVerificationPathFindings(
  contract: RepositoryContract,
  paths: readonly string[]
): readonly DiagnosticFinding[] {
  return verificationChecks(contract).flatMap((check) =>
    (check.paths ?? []).flatMap((pattern) =>
      matchesAnyPath(pattern, paths)
        ? []
        : [
            createDiagnosticFinding({
              id: `verification.path.${sanitizeId(check.id)}.${sanitizeId(pattern)}.missing`,
              ruleId: verificationStaleConfigRule.id,
              category: "verification",
              severity: "warning",
              confidence: "medium",
              title: "Verification check references a missing path",
              summary: `Verification check ${check.id} references ${pattern}, but no matching repository path was found.`,
              evidence: [
                {
                  kind: "contract",
                  summary: `Verification check ${check.id} path ${pattern} did not match inventory.`,
                  metadata: {
                    checkId: check.id,
                    pattern
                  }
                }
              ],
              suggestedNextSteps: [`Review verification check ${check.id} path ${pattern}.`]
            })
          ]
    )
  );
}

function missingVerificationComponentFindings(
  contract: RepositoryContract,
  componentIds: readonly string[]
): readonly DiagnosticFinding[] {
  const known = new Set(componentIds);

  return verificationChecks(contract).flatMap((check) =>
    (check.components ?? []).flatMap((componentId) =>
      known.has(componentId)
        ? []
        : [
            createDiagnosticFinding({
              id: `verification.component.${sanitizeId(check.id)}.${sanitizeId(componentId)}.missing`,
              ruleId: verificationStaleConfigRule.id,
              category: "verification",
              severity: "warning",
              confidence: "high",
              title: "Verification check references a missing component",
              summary: `Verification check ${check.id} references unknown component ${componentId}.`,
              evidence: [
                {
                  kind: "contract",
                  summary: `Unknown verification component ${componentId}.`,
                  metadata: {
                    checkId: check.id,
                    componentId
                  }
                }
              ],
              suggestedNextSteps: [
                `Update verification check ${check.id} or restore component ${componentId}.`
              ]
            })
          ]
    )
  );
}

function verificationChecks(contract: RepositoryContract): readonly VerificationCheck[] {
  return [
    ...(contract.verification?.default ?? []),
    ...(contract.verification?.rules ?? []).flatMap((rule) => rule.checks ?? [])
  ];
}

function severityForObservation(
  observation: VerificationObservation
): DiagnosticFinding["severity"] {
  if (observation.kind === "failed_check") {
    return "error";
  }

  if (
    observation.kind === "repeated_failure" ||
    observation.kind === "missing_configured_command" ||
    observation.kind === "blocked_check" ||
    observation.kind === "skipped_check"
  ) {
    return "warning";
  }

  return "info";
}

function titleForObservation(observation: VerificationObservation): string {
  if (observation.kind === "repeated_failure") {
    return "Verification check failed repeatedly";
  }

  if (observation.kind === "missing_configured_command") {
    return "Verification check is missing configuration";
  }

  if (observation.kind === "blocked_check") {
    return "Verification check is blocked";
  }

  if (observation.kind === "skipped_check") {
    return "Verification check was skipped";
  }

  return observation.status === "timed_out"
    ? "Verification check timed out"
    : "Verification check failed";
}

function nextStepForObservation(observation: VerificationObservation): string {
  if (observation.kind === "missing_configured_command") {
    return `Review verification check ${observation.checkId} command configuration.`;
  }

  return `Inspect verification check ${observation.checkId} before rerunning board verify.`;
}

function matchesAnyPath(pattern: string, paths: readonly string[]): boolean {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return paths.some((path) => path === prefix || path.startsWith(`${prefix}/`));
  }

  if (pattern.includes("*")) {
    const regex = new RegExp(`^${escapeRegex(pattern).replaceAll("\\*", ".*")}$`);
    return paths.some((path) => regex.test(path));
  }

  return paths.includes(pattern);
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}
