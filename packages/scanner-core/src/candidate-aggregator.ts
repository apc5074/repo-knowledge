import type { RepositoryDetector } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";

const detectorName = "candidate-aggregator";

export function createCandidateAggregatorDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["application.detected", "service.detected"],
    prerequisites: [
      {
        kind: "fact",
        value: "framework.detected"
      },
      {
        kind: "fact",
        value: "command.detected"
      }
    ],
    run: (context) => {
      const candidates = aggregateCandidates(context.facts);
      return {
        facts: candidates,
        stats: {
          facts_emitted: candidates.length
        }
      };
    }
  };
}

export function aggregateCandidates(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  return [...applicationCandidates(facts), ...serviceCandidates(facts)];
}

function applicationCandidates(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  const groups = new Map<string, ScannerFact[]>();

  for (const fact of facts) {
    if (!isApplicationSignal(fact)) {
      continue;
    }

    const path = candidatePath(fact);
    groups.set(path, [...(groups.get(path) ?? []), fact]);
  }

  return [...groups.entries()]
    .map(([path, group]) => applicationCandidate(path, group))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function serviceCandidates(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  return facts
    .filter((fact) =>
      [
        "compose.service_detected",
        "database.dependency_detected",
        "cache.dependency_detected",
        "service.detected"
      ].includes(fact.kind)
    )
    .map((fact) => serviceCandidate(fact))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function applicationCandidate(path: string, facts: readonly ScannerFact[]): ScannerFact {
  const signals = [...new Set(facts.map((fact) => fact.kind))].sort();
  const candidateKind = appKind(facts);

  return createScannerFact({
    kind: "application.detected",
    value: {
      name: candidateName(path, candidateKind),
      path,
      kind: `${candidateKind}-candidate`,
      candidate: true,
      signals,
      contributingFactIds: facts.map((fact) => fact.id).sort(),
      conflicts: conflictSignals(facts)
    },
    confidence: confidenceForApplication(facts),
    detector: detectorName,
    evidence: facts.flatMap((fact) => fact.evidence)
  });
}

function serviceCandidate(fact: ScannerFact): ScannerFact {
  const value = fact.value as {
    name?: string;
    kind?: string;
    service?: string;
    port?: number;
  };
  const name = value.service ?? value.name ?? "service";
  const kind = value.kind ?? (fact.kind === "cache.dependency_detected" ? "cache" : "service");

  return createScannerFact({
    kind: "service.detected",
    value: {
      name,
      kind,
      port: value.port,
      candidate: true,
      signals: [fact.kind],
      contributingFactIds: [fact.id]
    },
    confidence: fact.confidence,
    detector: detectorName,
    evidence: fact.evidence
  });
}

function isApplicationSignal(fact: ScannerFact): boolean {
  return [
    "framework.detected",
    "entrypoint.detected",
    "command.detected",
    "api.route_file_detected",
    "worker.detected",
    "application.detected"
  ].includes(fact.kind);
}

function candidatePath(fact: ScannerFact): string {
  const value = fact.value as { path?: string; cwd?: string; application?: string };
  const path = value.cwd ?? value.application ?? value.path ?? ".";

  if (path.includes("/package.json")) {
    return path.replace(/\/package\.json$/, "");
  }

  if (/\.[A-Za-z0-9]+$/.test(path)) {
    return path.includes("/") ? path.split("/").slice(0, -1).join("/") : ".";
  }

  return path || ".";
}

function appKind(
  facts: readonly ScannerFact[]
): "api" | "frontend" | "worker" | "cli" | "application" {
  const text = facts.map((fact) => JSON.stringify(fact.value)).join(" ");

  if (facts.some((fact) => fact.kind === "worker.detected") || /\bworker\b/i.test(text)) {
    return "worker";
  }

  if (/next|vite|react|frontend|browser/i.test(text)) {
    return "frontend";
  }

  if (/express|fastify|nestjs|fastapi|flask|django|api\.route/i.test(text)) {
    return "api";
  }

  if (/\bcli\b|bin/i.test(text)) {
    return "cli";
  }

  return "application";
}

function confidenceForApplication(facts: readonly ScannerFact[]): "high" | "medium" | "low" {
  const signalKinds = new Set(facts.map((fact) => fact.kind));

  if (signalKinds.size >= 2) {
    return "high";
  }

  if (facts.some((fact) => fact.confidence === "high")) {
    return "medium";
  }

  return "low";
}

function conflictSignals(facts: readonly ScannerFact[]): readonly string[] {
  const kinds = new Set(facts.map((fact) => appKind([fact])));

  return kinds.size > 1 ? [...kinds].sort() : [];
}

function candidateName(path: string, kind: string): string {
  return path === "." ? kind : (path.split("/").at(-1) ?? kind);
}
