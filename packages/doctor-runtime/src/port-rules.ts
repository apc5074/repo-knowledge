import { createDiagnosticFinding, type DiagnosticRule } from "./diagnostic-rule.js";
import type { ExpectedPort, PortObservation } from "./port-inspector.js";
import type { DiagnosticEvidence, DiagnosticFinding } from "./types.js";

export function createPortDiagnosticRules(): readonly DiagnosticRule[] {
  return [portObservationRule, duplicateContractPortRule, staleBoardPortRule];
}

export const portObservationRule: DiagnosticRule = {
  id: "ports.observations",
  category: "ports",
  description: "Diagnose occupied expected ports and missing expected listeners.",
  prerequisites: ["ports"],
  run: (context) => ({
    findings:
      context.ports?.observations.map((observation) => findingForPortObservation(observation)) ??
      [],
    warnings: []
  })
};

export const duplicateContractPortRule: DiagnosticRule = {
  id: "ports.contract-duplicates",
  category: "ports",
  description: "Detect multiple contract entries that claim the same host and port.",
  prerequisites: ["ports"],
  run: (context) => {
    const groups = new Map<string, ExpectedPort[]>();

    for (const port of context.ports?.expectedPorts ?? []) {
      const key = `${port.host}:${port.port}`;
      groups.set(key, [...(groups.get(key) ?? []), port]);
    }

    return {
      findings: [...groups.entries()].flatMap(([key, ports]) =>
        ports.length > 1 ? [duplicatePortFinding(key, ports)] : []
      ),
      warnings: []
    };
  }
};

export const staleBoardPortRule: DiagnosticRule = {
  id: "ports.stale-board-state",
  category: "ports",
  description: "Detect stale Board runtime sessions that still claim expected ports.",
  prerequisites: ["ports", "runtime"],
  run: (context) => {
    const stalePortKeys = new Set<string>();

    for (const session of context.runtime?.recentSessions ?? []) {
      if (!context.runtime?.staleSessionIds.includes(session.id)) {
        continue;
      }

      for (const resource of session.resources) {
        const port = resource.metadata?.port;
        const host =
          typeof resource.metadata?.host === "string" ? resource.metadata.host : "127.0.0.1";

        if (resource.kind === "port" && typeof port === "number") {
          stalePortKeys.add(`${host}:${port}`);
        }
      }
    }

    return {
      findings:
        context.ports?.checks
          .filter(
            (check) =>
              check.ownerKind === "board-managed" &&
              stalePortKeys.has(`${check.host}:${check.port}`)
          )
          .map((check) =>
            createDiagnosticFinding({
              id: `ports.stale-board-state.${check.host}-${check.port}`,
              ruleId: staleBoardPortRule.id,
              category: "ports",
              severity: "warning",
              confidence: "medium",
              title: "Stale Board runtime state claims a port",
              summary: `${check.ownerId} port ${check.port} is claimed by stale Board runtime state.`,
              evidence: [
                {
                  kind: "port",
                  summary: `${check.host}:${check.port} is associated with stale Board runtime state.`,
                  metadata: {
                    host: check.host,
                    port: check.port,
                    ownerId: check.ownerId
                  }
                }
              ],
              suggestedNextSteps: ["Run board status or board stop to inspect stale runtime state."]
            })
          ) ?? [],
      warnings: []
    };
  }
};

function findingForPortObservation(observation: PortObservation): DiagnosticFinding {
  return createDiagnosticFinding({
    id: `ports.${observation.kind}.${observation.host}-${observation.port}.${sanitizeId(observation.ownerId)}`,
    ruleId: portObservationRule.id,
    category: "ports",
    severity: observation.severity,
    confidence: observation.ownerKind === "unknown" ? "medium" : "high",
    title:
      observation.kind === "occupied_expected_port"
        ? "Expected port is occupied"
        : "Expected port is not listening",
    summary: observation.summary,
    evidence: [evidenceForPortObservation(observation)],
    suggestedNextSteps: [nextStepForPortObservation(observation)]
  });
}

function duplicatePortFinding(key: string, ports: readonly ExpectedPort[]): DiagnosticFinding {
  const [host, port] = key.split(":");

  return createDiagnosticFinding({
    id: `ports.contract-duplicate.${host}-${port}`,
    ruleId: duplicateContractPortRule.id,
    category: "ports",
    severity: "warning",
    confidence: "confirmed",
    title: "Multiple contract entries use the same port",
    summary: `${ports.map((item) => item.ownerId).join(", ")} all declare ${key}.`,
    evidence: ports.map((item) => ({
      kind: "port",
      summary: `${item.ownerType} ${item.ownerId} declares ${item.host}:${item.port}.`,
      metadata: {
        ownerId: item.ownerId,
        ownerType: item.ownerType,
        host: item.host,
        port: item.port
      }
    })),
    suggestedNextSteps: [
      "Review the contract port assignments and change one of the conflicting ports if needed."
    ]
  });
}

function evidenceForPortObservation(observation: PortObservation): DiagnosticEvidence {
  return {
    kind: "port",
    summary: observation.summary,
    metadata: {
      kind: observation.kind,
      host: observation.host,
      port: observation.port,
      ownerId: observation.ownerId,
      ownerKind: observation.ownerKind
    }
  };
}

function nextStepForPortObservation(observation: PortObservation): string {
  if (observation.kind === "missing_expected_listener") {
    return `Inspect ${observation.ownerId} startup and health checks for port ${observation.port}.`;
  }

  if (observation.ownerKind === "unknown") {
    return `Inspect the local process using port ${observation.port}; Board will not stop it automatically.`;
  }

  return `Inspect Board-managed runtime state for ${observation.ownerId} port ${observation.port}.`;
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}
