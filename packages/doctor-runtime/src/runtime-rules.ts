import { createDiagnosticFinding, type DiagnosticRule } from "./diagnostic-rule.js";
import type { RuntimeSessionObservation } from "./runtime-inspector.js";
import type { DiagnosticFinding } from "./types.js";

export function createRuntimeFailureDiagnosticRules(): readonly DiagnosticRule[] {
  return [runtimeObservationRule, repeatedRuntimeFailureRule];
}

export const runtimeObservationRule: DiagnosticRule = {
  id: "runtime.failures",
  category: "runtime",
  description: "Diagnose failures observed in recent Board runtime sessions.",
  prerequisites: ["runtime"],
  run: (context) => ({
    findings:
      context.runtime?.observations.map((observation) => findingForObservation(observation)) ?? [],
    warnings: []
  })
};

export const repeatedRuntimeFailureRule: DiagnosticRule = {
  id: "runtime.repeated-failures",
  category: "runtime",
  description: "Detect repeated runtime failure observations across recent sessions.",
  prerequisites: ["runtime"],
  run: (context) => {
    const observations = context.runtime?.observations ?? [];
    const groups = new Map<string, RuntimeSessionObservation[]>();

    for (const observation of observations.filter((item) => item.severity === "error")) {
      const key = repeatKey(observation);
      groups.set(key, [...(groups.get(key) ?? []), observation]);
    }

    return {
      findings: [...groups.entries()].flatMap(([key, group]) =>
        group.length > 1 ? [repeatedFinding(key, group)] : []
      ),
      warnings: []
    };
  }
};

function findingForObservation(observation: RuntimeSessionObservation): DiagnosticFinding {
  const target =
    observation.stepId ??
    observation.healthCheckId ??
    observation.commandResultId ??
    observation.resourceId ??
    observation.sessionId;

  return createDiagnosticFinding({
    id: `runtime.${observation.kind}.${sanitizeId(target)}`,
    ruleId: runtimeObservationRule.id,
    category: "runtime",
    severity: observation.kind === "stale_session" ? "warning" : "error",
    confidence: observation.kind === "stale_session" ? "medium" : "confirmed",
    title: titleForObservation(observation),
    summary: observation.summary,
    evidence: [
      {
        kind: "runtime_session",
        summary: observation.summary,
        runId: observation.sessionId,
        metadata: {
          kind: observation.kind,
          ...(observation.stepId === undefined ? {} : { stepId: observation.stepId }),
          ...(observation.resourceId === undefined ? {} : { resourceId: observation.resourceId }),
          ...(observation.healthCheckId === undefined
            ? {}
            : { healthCheckId: observation.healthCheckId }),
          ...(observation.commandResultId === undefined
            ? {}
            : { commandResultId: observation.commandResultId })
        }
      }
    ],
    suggestedNextSteps: [nextStepForObservation(observation)]
  });
}

function repeatedFinding(
  key: string,
  observations: readonly RuntimeSessionObservation[]
): DiagnosticFinding {
  const first = observations[0];
  const sessionIds = [...new Set(observations.map((observation) => observation.sessionId))].sort();

  return createDiagnosticFinding({
    id: `runtime.repeated.${sanitizeId(key)}`,
    ruleId: repeatedRuntimeFailureRule.id,
    category: "runtime",
    severity: "warning",
    confidence: "high",
    title: `Repeated runtime failure: ${key}`,
    summary: `${key} occurred ${observations.length} times across ${sessionIds.length} runtime session(s).`,
    evidence: observations.map((observation) => ({
      kind: "runtime_session",
      summary: observation.summary,
      runId: observation.sessionId,
      metadata: {
        kind: observation.kind
      }
    })),
    counterEvidence:
      first === undefined
        ? []
        : [
            {
              kind: "runtime_session",
              summary: "Repeated failure grouping is based on local session history only.",
              runId: first.sessionId
            }
          ],
    suggestedNextSteps: ["Review the repeated runtime failure before retrying startup."]
  });
}

function repeatKey(observation: RuntimeSessionObservation): string {
  return [
    observation.kind,
    observation.stepId,
    observation.healthCheckId,
    observation.commandResultId,
    observation.resourceId
  ]
    .filter((value): value is string => value !== undefined)
    .join(":");
}

function titleForObservation(observation: RuntimeSessionObservation): string {
  if (observation.kind === "failed_migration") {
    return "Migration command failed";
  }

  if (observation.kind === "failed_seed") {
    return "Seed command failed";
  }

  if (observation.kind === "failed_health_check") {
    return "Runtime health check failed";
  }

  if (observation.kind === "failed_process") {
    return "Runtime command failed";
  }

  if (observation.kind === "failed_resource") {
    return "Runtime resource failed";
  }

  if (observation.kind === "stale_session") {
    return "Runtime session appears stale";
  }

  return "Runtime step failed";
}

function nextStepForObservation(observation: RuntimeSessionObservation): string {
  if (observation.stepId !== undefined) {
    return `Inspect runtime step ${observation.stepId}, fix the local issue, then rerun board start.`;
  }

  if (observation.healthCheckId !== undefined) {
    return `Inspect health check ${observation.healthCheckId} and the related app or service.`;
  }

  if (observation.commandResultId !== undefined) {
    return `Inspect runtime command ${observation.commandResultId}.`;
  }

  if (observation.resourceId !== undefined) {
    return `Inspect runtime resource ${observation.resourceId}.`;
  }

  return `Inspect runtime session ${observation.sessionId}.`;
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}
