import type { Application, Environment, Service } from "@repo-knowledge/repository-contract";
import type { ScannerFact } from "@repo-knowledge/scanner-core";

import { scannerFactEvidence } from "./evidence.js";
import type { InitReviewItem } from "./result.js";

export type EnvironmentMappingInput = {
  readonly facts: readonly ScannerFact[];
  readonly applications?: Readonly<Record<string, Application>>;
  readonly services?: Readonly<Record<string, Service>>;
};

export type EnvironmentMappingResult = {
  readonly environment: Environment;
  readonly reviewItems: readonly InitReviewItem[];
  readonly inferredFields: readonly string[];
  readonly unconfirmedFields: readonly string[];
};

type FactRecord = Record<string, unknown>;

export function mapScannerFactsToEnvironment(
  input: EnvironmentMappingInput | readonly ScannerFact[]
): EnvironmentMappingResult {
  const facts = isScannerFactArray(input) ? input : input.facts;
  const applications = isScannerFactArray(input) ? {} : (input.applications ?? {});
  const services = isScannerFactArray(input) ? {} : (input.services ?? {});
  const environment: Environment = {};
  const reviewItems: InitReviewItem[] = [];

  for (const fact of environmentFacts(facts)) {
    const value = fact.value as FactRecord;
    const name = stringValue(value.name);

    if (!name || !/^[A-Z][A-Z0-9_]*$/.test(name)) {
      continue;
    }

    const existing = environment[name];
    const secret = Boolean(value.secret) || isSecretLikeName(name);
    const required = existing?.required === true || value.required === true;
    const usedBy = [
      ...new Set([
        ...(existing?.used_by ?? []),
        ...usedByReferences(fact, value, applications, services)
      ])
    ].sort();

    environment[name] = {
      name,
      required,
      secret,
      used_by: usedBy,
      source: "scanner",
      evidence: [...(existing?.evidence ?? []), ...scannerFactEvidence(fact)]
    };

    if (secret) {
      reviewItems.push({
        id: `environment-${name.toLowerCase()}-secret-review`,
        kind: "confirmation-required",
        title: "Secret-like environment variable detected",
        summary: `${name} looks secret-bearing and was recorded without values. Confirm how it should be provided locally.`,
        evidence: fact.evidence.map((evidence) => evidence.source_path)
      });
    }
  }

  return {
    environment,
    reviewItems: dedupeReviewItems(reviewItems),
    inferredFields: Object.keys(environment).length > 0 ? ["environment"] : [],
    unconfirmedFields: reviewItems.map((item) => item.id)
  };
}

function environmentFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  return facts
    .filter((fact) => fact.kind === "environment.variable_detected" && fact.confidence !== "low")
    .sort((left, right) => {
      const leftName = stringValue((left.value as FactRecord).name) ?? left.id;
      const rightName = stringValue((right.value as FactRecord).name) ?? right.id;
      return leftName.localeCompare(rightName) || left.detector.localeCompare(right.detector);
    });
}

function isScannerFactArray(
  input: EnvironmentMappingInput | readonly ScannerFact[]
): input is readonly ScannerFact[] {
  return Array.isArray(input);
}

function usedByReferences(
  fact: ScannerFact,
  value: FactRecord,
  applications: Readonly<Record<string, Application>>,
  services: Readonly<Record<string, Service>>
): readonly string[] {
  const references = new Set<string>();
  const serviceName = stringValue(value.service);

  if (serviceName) {
    for (const [serviceId, service] of Object.entries(services)) {
      if (service.compose_service === serviceName || service.name === serviceName) {
        references.add(serviceId);
      }
    }
    references.add(serviceName);
  }

  for (const evidence of fact.evidence) {
    const sourcePath = evidence.source_path;

    if (!sourcePath) {
      continue;
    }

    for (const [applicationId, application] of Object.entries(applications)) {
      const workingDirectory = application.working_directory ?? ".";

      if (
        workingDirectory === "." ||
        sourcePath === workingDirectory ||
        sourcePath.startsWith(`${workingDirectory}/`)
      ) {
        references.add(applicationId);
      }
    }
  }

  return [...references].sort();
}

export function isSecretLikeName(name: string): boolean {
  return /(SECRET|TOKEN|KEY|PASSWORD|PASS|PRIVATE|CREDENTIAL|AUTH|JWT)/i.test(name);
}

function dedupeReviewItems(items: readonly InitReviewItem[]): readonly InitReviewItem[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
