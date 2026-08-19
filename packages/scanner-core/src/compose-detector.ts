import { parseDocument } from "yaml";

import type { RepositoryDetector, ScanWarning } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { createEvidenceFromLocation, findStringLocation } from "./source-location.js";

const detectorName = "compose";

export type ComposeService = {
  readonly name: string;
  readonly image?: string;
  readonly build?: string;
  readonly ports: readonly string[];
  readonly environment: readonly string[];
  readonly dependsOn: readonly string[];
  readonly volumes: readonly string[];
  readonly command?: string;
  readonly healthcheck?: boolean;
};

export type ComposeFileInfo = {
  readonly path: string;
  readonly services: readonly ComposeService[];
};

export type ParseComposeFileResult =
  | { readonly ok: true; readonly compose: ComposeFileInfo }
  | { readonly ok: false; readonly warning: ScanWarning };

export function parseComposeFile(path: string, text: string): ParseComposeFileResult {
  const document = parseDocument(text, {
    prettyErrors: false
  });

  if (document.errors.length > 0) {
    return {
      ok: false,
      warning: {
        detector: detectorName,
        path,
        message: `Could not parse ${path}: ${document.errors[0]?.message ?? "invalid YAML"}`
      }
    };
  }

  const root = document.toJSON() as { services?: unknown };

  if (!root.services || typeof root.services !== "object" || Array.isArray(root.services)) {
    return {
      ok: true,
      compose: {
        path,
        services: []
      }
    };
  }

  return {
    ok: true,
    compose: {
      path,
      services: Object.entries(root.services as Record<string, unknown>)
        .map(([name, service]) => parseService(name, service))
        .sort((left, right) => left.name.localeCompare(right.name))
    }
  };
}

export function createComposeDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: [
      "compose.file_detected",
      "compose.service_detected",
      "service.detected",
      "environment.variable_detected",
      "database.dependency_detected",
      "cache.dependency_detected",
      "command.detected"
    ],
    filePatterns: ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"],
    run: async (context) => {
      const facts: ScannerFact[] = [];
      const warnings: ScanWarning[] = [];

      for (const path of context.inventory.files.filter(isComposePath)) {
        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        const parsed = parseComposeFile(path, result.text);

        if (!parsed.ok) {
          warnings.push(parsed.warning);
          continue;
        }

        facts.push(...composeFacts(parsed.compose, result.text));
      }

      return {
        facts: dedupeFacts(facts),
        warnings,
        stats: {
          files_considered: context.inventory.files.length,
          facts_emitted: facts.length
        }
      };
    }
  };
}

function composeFacts(compose: ComposeFileInfo, text: string): readonly ScannerFact[] {
  const facts: ScannerFact[] = [
    createScannerFact({
      kind: "compose.file_detected",
      value: {
        path: compose.path,
        serviceCount: compose.services.length
      },
      confidence: "high",
      detector: detectorName,
      evidence: [
        createEvidenceFromLocation({
          kind: "config",
          sourcePath: compose.path,
          detector: detectorName,
          location: findStringLocation(text, "services:") ?? { line_start: 1, line_end: 1 }
        })
      ]
    })
  ];

  for (const service of compose.services) {
    facts.push(serviceFact(compose.path, service, text));

    for (const variable of service.environment) {
      facts.push(environmentFact(compose.path, service.name, variable, text));
    }

    if (isPostgresService(service)) {
      facts.push(databaseFact(compose.path, service, text));
    }

    if (isRedisService(service)) {
      facts.push(cacheFact(compose.path, service, text));
    }

    if (service.command) {
      facts.push(commandFact(compose.path, service, text));
    }
  }

  return facts;
}

function serviceFact(path: string, service: ComposeService, text: string): ScannerFact {
  return createScannerFact({
    kind: "compose.service_detected",
    value: {
      name: service.name,
      image: service.image,
      build: service.build,
      ports: service.ports,
      environment: service.environment,
      depends_on: service.dependsOn,
      healthcheck: service.healthcheck,
      volumes: service.volumes,
      command: service.command
    },
    confidence: "high",
    detector: detectorName,
    evidence: [serviceEvidence(path, service.name, text)]
  });
}

function environmentFact(path: string, service: string, name: string, text: string): ScannerFact {
  return createScannerFact({
    kind: "environment.variable_detected",
    value: {
      name,
      source: "compose",
      service
    },
    confidence: "high",
    detector: detectorName,
    evidence: [environmentEvidence(path, name, text)]
  });
}

function databaseFact(path: string, service: ComposeService, text: string): ScannerFact {
  return createScannerFact({
    kind: "database.dependency_detected",
    value: {
      name: "postgresql",
      kind: "database",
      service: service.name
    },
    confidence: "high",
    detector: detectorName,
    evidence: [serviceEvidence(path, service.name, text)]
  });
}

function cacheFact(path: string, service: ComposeService, text: string): ScannerFact {
  return createScannerFact({
    kind: "cache.dependency_detected",
    value: {
      name: "redis",
      service: service.name
    },
    confidence: "high",
    detector: detectorName,
    evidence: [serviceEvidence(path, service.name, text)]
  });
}

function commandFact(path: string, service: ComposeService, text: string): ScannerFact {
  return createScannerFact({
    kind: "command.detected",
    value: {
      name: `${service.name}:command`,
      command: service.command,
      category: "runtime",
      cwd: "."
    },
    confidence: "high",
    detector: detectorName,
    evidence: [serviceEvidence(path, service.name, text)]
  });
}

function parseService(name: string, service: unknown): ComposeService {
  const value =
    service && typeof service === "object" && !Array.isArray(service)
      ? (service as Record<string, unknown>)
      : {};

  return {
    name,
    image: stringValue(value.image),
    build: buildValue(value.build),
    ports: stringList(value.ports),
    environment: environmentNames(value.environment),
    dependsOn: dependsOnNames(value.depends_on),
    volumes: stringList(value.volumes),
    command: commandValue(value.command),
    healthcheck: value.healthcheck !== undefined
  };
}

function isComposePath(path: string): boolean {
  const name = path.split("/").at(-1) ?? path;

  return /^(?:docker-)?compose(?:\.[\w-]+)?\.ya?ml$/.test(name);
}

function isPostgresService(service: ComposeService): boolean {
  return /postgres|postgis/i.test(
    `${service.name} ${service.image ?? ""} ${service.ports.join(" ")}`
  );
}

function isRedisService(service: ComposeService): boolean {
  return /redis/i.test(`${service.name} ${service.image ?? ""} ${service.ports.join(" ")}`);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function buildValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return stringValue((value as { context?: unknown }).context);
  }

  return undefined;
}

function stringList(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === "string") {
    return [value];
  }

  return [];
}

function environmentNames(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value
      .map(String)
      .map((entry) => entry.split("=")[0]!)
      .filter(Boolean)
      .sort();
  }

  if (value && typeof value === "object") {
    return Object.keys(value).sort();
  }

  return [];
}

function dependsOnNames(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.map(String).sort();
  }

  if (value && typeof value === "object") {
    return Object.keys(value).sort();
  }

  return [];
}

function commandValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(String).join(" ");
  }

  return undefined;
}

function serviceEvidence(path: string, needle: string, text: string) {
  return createEvidenceFromLocation({
    kind: "config",
    sourcePath: path,
    detector: detectorName,
    location: findStringLocation(text, needle) ?? { line_start: 1, line_end: 1 }
  });
}

function environmentEvidence(path: string, name: string, text: string) {
  const lineNumber = text.split(/\r?\n/).findIndex((line) => line.includes(name));

  return createEvidenceFromLocation({
    kind: "config",
    sourcePath: path,
    detector: detectorName,
    location:
      lineNumber === -1
        ? { line_start: 1, line_end: 1, excerpt: name }
        : {
            line_start: lineNumber + 1,
            line_end: lineNumber + 1,
            excerpt: name
          }
  });
}

function dedupeFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  const seen = new Set<string>();

  return facts.filter((fact) => {
    const value = fact.value as {
      name?: string;
      path?: string;
      service?: string;
      command?: string;
    };
    const key = `${fact.kind}:${value.path ?? ""}:${value.name ?? ""}:${value.service ?? ""}:${value.command ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
