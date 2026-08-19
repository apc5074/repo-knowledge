import type { RepositoryContract } from "@repo-knowledge/repository-contract";
import type { ScannerFact } from "@repo-knowledge/scanner-core";

export type LocalDevelopmentAssumption = {
  readonly id: string;
  readonly subject: string;
  readonly value: string;
  readonly confidence: "low" | "medium" | "high";
  readonly source: "scanner" | "contract";
  readonly reviewRequired: boolean;
  readonly evidence: readonly string[];
};

export type LocalDevelopmentAssumptionResult = {
  readonly assumptions: readonly LocalDevelopmentAssumption[];
  readonly inferredFields: readonly string[];
  readonly unconfirmedFields: readonly string[];
};

export function generateLocalDevelopmentAssumptions(input: {
  readonly facts: readonly ScannerFact[];
  readonly contract: RepositoryContract;
}): LocalDevelopmentAssumptionResult {
  const assumptions = [
    ...packageManagerAssumptions(input.facts),
    ...serviceAssumptions(input.contract),
    ...setupAssumptions(input.contract),
    ...portAssumptions(input.contract)
  ].sort((left, right) => left.id.localeCompare(right.id));

  return {
    assumptions,
    inferredFields: assumptions.length > 0 ? ["local_development_assumptions"] : [],
    unconfirmedFields: assumptions
      .filter((assumption) => assumption.reviewRequired)
      .map((assumption) => assumption.id)
  };
}

function packageManagerAssumptions(
  facts: readonly ScannerFact[]
): readonly LocalDevelopmentAssumption[] {
  return facts
    .filter((fact) => fact.kind === "package_manager.detected" && fact.confidence !== "low")
    .map((fact) => {
      const value = fact.value as Record<string, unknown>;
      const name = typeof value.name === "string" ? value.name : "unknown";

      return {
        id: "package-manager",
        subject: "Package manager",
        value: name,
        confidence: fact.confidence,
        source: "scanner" as const,
        reviewRequired: fact.confidence !== "high",
        evidence: fact.evidence.map((evidence) => evidence.source_path).filter(isString)
      };
    })
    .slice(0, 1);
}

function serviceAssumptions(contract: RepositoryContract): readonly LocalDevelopmentAssumption[] {
  return Object.values(contract.services ?? {}).map((service) => ({
    id: `service-${service.id}`,
    subject: `${service.type} service`,
    value: service.compose_service ?? service.name ?? service.id,
    confidence: "high" as const,
    source: "contract" as const,
    reviewRequired: service.health_check === undefined,
    evidence: (service.evidence ?? []).map((evidence) => evidence.source_path).filter(isString)
  }));
}

function setupAssumptions(contract: RepositoryContract): readonly LocalDevelopmentAssumption[] {
  const setup = contract.setup ?? {};
  const entries = [
    ["start-services", setup.start_services?.command],
    ["migrate", setup.migrate?.command],
    ["seed", setup.seed?.command],
    ["install", setup.install?.command]
  ] as const;
  const assumptions: LocalDevelopmentAssumption[] = [];

  for (const [id, command] of entries) {
    if (command === undefined) {
      continue;
    }

    assumptions.push({
      id: `setup-${id}`,
      subject: `${id} command`,
      value: command,
      confidence: "high" as const,
      source: "contract" as const,
      reviewRequired: false,
      evidence: []
    });
  }

  return assumptions;
}

function portAssumptions(contract: RepositoryContract): readonly LocalDevelopmentAssumption[] {
  const applicationPorts = Object.values(contract.applications ?? {}).flatMap((application) =>
    (application.ports ?? []).map((port) => ({
      id: `port-${application.id}-${port}`,
      subject: `${application.id} port`,
      value: String(port),
      confidence: "medium" as const,
      source: "contract" as const,
      reviewRequired: true,
      evidence: (application.evidence ?? [])
        .map((evidence) => evidence.source_path)
        .filter(isString)
    }))
  );
  const servicePorts = Object.values(contract.services ?? {}).flatMap((service) =>
    (service.ports ?? []).map((port) => ({
      id: `port-${service.id}-${port}`,
      subject: `${service.id} port`,
      value: String(port),
      confidence: "high" as const,
      source: "contract" as const,
      reviewRequired: false,
      evidence: (service.evidence ?? []).map((evidence) => evidence.source_path).filter(isString)
    }))
  );

  return [...applicationPorts, ...servicePorts];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
