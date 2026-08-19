import type { RepositoryDetector } from "./detector.js";
import { parseComposeFile } from "./compose-detector.js";
import { parseEnvExampleFile } from "./env-file-detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { parseJavaScriptPackageManifest } from "./javascript-manifest.js";
import { parsePythonManifest } from "./python-manifest.js";
import {
  createEvidenceFromLocation,
  findRegexLocation,
  findStringLocation,
  type SourceLocation
} from "./source-location.js";

const detectorName = "database-dependency";

const postgresPackages = new Set(["pg", "postgres", "postgres.js", "prisma", "@prisma/client"]);
const pythonPostgresPackages = new Set(["psycopg", "psycopg2", "asyncpg"]);
const genericDatabasePackages = new Set(["sqlalchemy"]);
const redisPackages = new Set(["redis", "ioredis"]);

export type DependencySignal = {
  readonly dependency: "postgresql" | "database" | "redis";
  readonly source: "manifest" | "env" | "compose-image" | "compose-port" | "config";
  readonly path: string;
  readonly package?: string;
  readonly service?: string;
  readonly port?: number;
  readonly line?: SourceLocation;
};

export function createDatabaseDependencyDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: [
      "database.dependency_detected",
      "cache.dependency_detected",
      "service.detected"
    ],
    filePatterns: [
      "package.json",
      "pyproject.toml",
      "requirements*.txt",
      "compose.yaml",
      "compose.yml",
      "docker-compose.yaml",
      "docker-compose.yml",
      ".env.example",
      ".env.sample",
      ".env.template",
      "env.example",
      "prisma/schema.prisma",
      "alembic.ini"
    ],
    run: async (context) => {
      const signals: DependencySignal[] = [];

      for (const path of context.inventory.files) {
        if (!isCandidatePath(path)) {
          continue;
        }

        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        signals.push(...signalsForFile(path, result.text));
      }

      const facts = factsFromSignals(signals);

      return {
        facts,
        stats: {
          files_considered: context.inventory.files.length,
          facts_emitted: facts.length
        }
      };
    }
  };
}

function signalsForFile(path: string, text: string): readonly DependencySignal[] {
  if (path.endsWith("package.json")) {
    return javascriptSignals(path, text);
  }

  if (isPythonManifestPath(path)) {
    return pythonSignals(path, text);
  }

  if (isComposePath(path)) {
    return composeSignals(path, text);
  }

  if (isSafeEnvExamplePath(path)) {
    return envSignals(path, text);
  }

  if (path.endsWith("schema.prisma")) {
    return prismaSignals(path, text);
  }

  if (path.endsWith("alembic.ini")) {
    return [
      {
        dependency: "database",
        source: "config",
        path,
        package: "alembic",
        line: findStringLocation(text, "[alembic]")
      }
    ];
  }

  return [];
}

function javascriptSignals(path: string, text: string): readonly DependencySignal[] {
  const parsed = parseJavaScriptPackageManifest(path, text);

  if (!parsed.ok) {
    return [];
  }

  return Object.keys({
    ...parsed.manifest.dependencies,
    ...parsed.manifest.devDependencies
  })
    .map((dependency) => {
      if (postgresPackages.has(dependency)) {
        return packageSignal("postgresql", path, dependency, text);
      }

      if (redisPackages.has(dependency)) {
        return packageSignal("redis", path, dependency, text);
      }

      return undefined;
    })
    .filter((signal): signal is DependencySignal => signal !== undefined);
}

function pythonSignals(path: string, text: string): readonly DependencySignal[] {
  const parsed = parsePythonManifest(path, text);

  if (!parsed.ok) {
    return [];
  }

  return parsed.manifest.dependencies
    .map((dependency) => {
      const normalized = dependency.toLowerCase().replaceAll("_", "-");

      if (pythonPostgresPackages.has(normalized)) {
        return packageSignal("postgresql", path, dependency, text);
      }

      if (genericDatabasePackages.has(normalized)) {
        return packageSignal("database", path, dependency, text);
      }

      if (normalized === "redis") {
        return packageSignal("redis", path, dependency, text);
      }

      return undefined;
    })
    .filter((signal): signal is DependencySignal => signal !== undefined);
}

function composeSignals(path: string, text: string): readonly DependencySignal[] {
  const parsed = parseComposeFile(path, text);

  if (!parsed.ok) {
    return [];
  }

  const signals: DependencySignal[] = [];

  for (const service of parsed.compose.services) {
    const serviceText = `${service.name} ${service.image ?? ""}`.toLowerCase();

    if (/postgres|postgis/.test(serviceText)) {
      signals.push({
        dependency: "postgresql",
        source: "compose-image",
        path,
        service: service.name,
        line: findStringLocation(text, service.name)
      });
    }

    if (/redis/.test(serviceText)) {
      signals.push({
        dependency: "redis",
        source: "compose-image",
        path,
        service: service.name,
        line: findStringLocation(text, service.name)
      });
    }

    for (const port of service.ports.flatMap(exposedPorts)) {
      if (port === 5432 || port === 6379) {
        signals.push({
          dependency: port === 5432 ? "postgresql" : "redis",
          source: "compose-port",
          path,
          service: service.name,
          port,
          line: findStringLocation(text, String(port))
        });
      }
    }
  }

  return signals;
}

function envSignals(path: string, text: string): readonly DependencySignal[] {
  return parseEnvExampleFile(path, text)
    .variables.map((variable): DependencySignal | undefined => {
      if (
        /^(DATABASE_URL|POSTGRES(?:QL)?_URL|PG[A-Z0-9_]*|POSTGRES[A-Z0-9_]*)$/.test(variable.name)
      ) {
        return {
          dependency: "postgresql",
          source: "env",
          path,
          line: variableLocation(variable.line, variable.name)
        } satisfies DependencySignal;
      }

      if (/^REDIS[A-Z0-9_]*$/.test(variable.name)) {
        return {
          dependency: "redis",
          source: "env",
          path,
          line: variableLocation(variable.line, variable.name)
        } satisfies DependencySignal;
      }

      return undefined;
    })
    .filter((signal): signal is DependencySignal => signal !== undefined);
}

function prismaSignals(path: string, text: string): readonly DependencySignal[] {
  if (!/provider\s*=\s*["']postgres(?:ql)?["']/.test(text)) {
    return [
      {
        dependency: "database",
        source: "config",
        path,
        package: "prisma",
        line: findRegexLocation(text, /provider\s*=/)
      }
    ];
  }

  return [
    {
      dependency: "postgresql",
      source: "config",
      path,
      package: "prisma",
      line: findRegexLocation(text, /provider\s*=\s*["']postgres(?:ql)?["']/)
    }
  ];
}

function factsFromSignals(signals: readonly DependencySignal[]): readonly ScannerFact[] {
  const grouped = new Map<string, DependencySignal[]>();

  for (const signal of signals) {
    const key = `${signal.dependency}:${signal.service ?? signal.package ?? "repository"}`;
    grouped.set(key, [...(grouped.get(key) ?? []), signal]);
  }

  const facts: ScannerFact[] = [];

  for (const group of grouped.values()) {
    const representative = group[0]!;
    const confidence = confidenceForSignals(group);
    const kind =
      representative.dependency === "redis"
        ? "cache.dependency_detected"
        : "database.dependency_detected";

    facts.push(
      createScannerFact({
        kind,
        value: {
          name: representative.dependency,
          kind: representative.dependency === "redis" ? "cache" : "database",
          package: representative.package,
          service: representative.service,
          port: representative.port,
          sources: [...new Set(group.map((signal) => signal.source))].sort()
        },
        confidence,
        detector: detectorName,
        evidence: group.map((signal) =>
          createEvidenceFromLocation({
            kind: "config",
            sourcePath: signal.path,
            detector: detectorName,
            location: signal.line
          })
        )
      })
    );

    if (representative.service) {
      facts.push(
        createScannerFact({
          kind: "service.detected",
          value: {
            name: representative.service,
            kind: representative.dependency === "redis" ? "cache" : "database",
            source: "compose",
            port: representative.port
          },
          confidence,
          detector: detectorName,
          evidence: [
            createEvidenceFromLocation({
              kind: "config",
              sourcePath: representative.path,
              detector: detectorName,
              location: representative.line
            })
          ]
        })
      );
    }
  }

  return facts.sort((left, right) => left.id.localeCompare(right.id));
}

function packageSignal(
  dependency: "postgresql" | "database" | "redis",
  path: string,
  packageName: string,
  text: string
): DependencySignal {
  return {
    dependency,
    source: "manifest",
    path,
    package: packageName,
    line: findStringLocation(text, packageName)
  };
}

function confidenceForSignals(signals: readonly DependencySignal[]): "high" | "medium" | "low" {
  const sources = new Set(signals.map((signal) => signal.source));
  const onlyPort = sources.size === 1 && sources.has("compose-port");

  if (onlyPort) {
    return "low";
  }

  if (sources.size > 1 || signals.some((signal) => signal.source !== "compose-port")) {
    return "high";
  }

  return "medium";
}

function exposedPorts(port: string): readonly number[] {
  return (port.match(/\d+/g) ?? []).map((value) => Number.parseInt(value, 10));
}

function variableLocation(line: number, name: string): SourceLocation {
  return {
    line_start: line,
    line_end: line,
    excerpt: name
  };
}

function isCandidatePath(path: string): boolean {
  return (
    path.endsWith("package.json") ||
    isPythonManifestPath(path) ||
    isComposePath(path) ||
    isSafeEnvExamplePath(path) ||
    path.endsWith("schema.prisma") ||
    path.endsWith("alembic.ini")
  );
}

function isPythonManifestPath(path: string): boolean {
  return (
    path.endsWith("pyproject.toml") ||
    path.endsWith("requirements.txt") ||
    path.endsWith("requirements-dev.txt") ||
    path.endsWith("requirements.in")
  );
}

function isComposePath(path: string): boolean {
  const name = path.split("/").at(-1) ?? path;

  return /^(?:docker-)?compose(?:\.[\w-]+)?\.ya?ml$/.test(name);
}

function isSafeEnvExamplePath(path: string): boolean {
  const name = path.split("/").at(-1) ?? path;

  return (
    name === ".env.example" ||
    name === ".env.sample" ||
    name === ".env.template" ||
    name === "env.example"
  );
}
