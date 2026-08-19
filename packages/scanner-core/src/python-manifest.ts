import type { RepositoryDetector, ScanContext, ScanWarning } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import {
  createEvidenceFromLocation,
  findRegexLocation,
  findStringLocation
} from "./source-location.js";

const detectorName = "python-manifest";

export type PythonManifest = {
  readonly path: string;
  readonly projectName?: string;
  readonly dependencies: readonly string[];
  readonly optionalDependencies: Readonly<Record<string, readonly string[]>>;
  readonly toolHints: readonly string[];
};

export type ParsePythonManifestResult =
  | {
      readonly ok: true;
      readonly manifest: PythonManifest;
    }
  | {
      readonly ok: false;
      readonly warning: ScanWarning;
    };

const frameworkPackages = new Map([
  ["fastapi", "FastAPI"],
  ["flask", "Flask"],
  ["django", "Django"],
  ["celery", "Celery"],
  ["pytest", "pytest"],
  ["sqlalchemy", "SQLAlchemy"],
  ["alembic", "Alembic"]
]);
const databasePackages = new Map([
  ["psycopg", "postgresql"],
  ["psycopg2", "postgresql"],
  ["asyncpg", "postgresql"],
  ["sqlalchemy", "database"]
]);

export function parsePythonManifest(path: string, text: string): ParsePythonManifestResult {
  if (path.endsWith("pyproject.toml")) {
    return parsePyproject(path, text);
  }

  if (path.includes("requirements") && (path.endsWith(".txt") || path.endsWith(".in"))) {
    return parseRequirements(path, text);
  }

  if (path.endsWith("setup.cfg") || path.endsWith("setup.py")) {
    return parseSetupFile(path, text);
  }

  return {
    ok: true,
    manifest: {
      path,
      dependencies: [],
      optionalDependencies: {},
      toolHints: []
    }
  };
}

export function createPythonManifestDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: [
      "application.detected",
      "package_manager.detected",
      "framework.detected",
      "database.dependency_detected",
      "cache.dependency_detected"
    ],
    filePatterns: [
      "pyproject.toml",
      "requirements*.txt",
      "requirements.in",
      "poetry.lock",
      "uv.lock"
    ],
    run: async (context) => {
      const facts: ScannerFact[] = [];
      const warnings: ScanWarning[] = [];

      for (const path of pythonManifestPaths(context)) {
        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        const parsed = parsePythonManifest(path, result.text);

        if (!parsed.ok) {
          warnings.push(parsed.warning);
          continue;
        }

        facts.push(...manifestFacts(parsed.manifest, result.text));
      }

      facts.push(...lockfileFacts(context));

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

function parsePyproject(path: string, text: string): ParsePythonManifestResult {
  if (hasLikelyTomlSyntaxError(text)) {
    return warning(path, "Could not parse pyproject.toml: likely malformed TOML string.");
  }

  const dependencies = [
    ...arraySectionValues(text, "dependencies"),
    ...sectionDependencyValues(text, "tool.poetry.dependencies")
  ];
  const optionalDependencies = optionalDependencyGroups(text);
  const toolHints = [...text.matchAll(/^\[(tool\.[^\]]+)\]/gm)]
    .map((match) => match[1])
    .filter(Boolean);

  return {
    ok: true,
    manifest: {
      path,
      projectName: stringAssignment(text, "name"),
      dependencies,
      optionalDependencies,
      toolHints
    }
  };
}

function parseRequirements(path: string, text: string): ParsePythonManifestResult {
  const dependencies: string[] = [];

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("-r ")) {
      continue;
    }

    const name = packageNameFromRequirement(trimmed);

    if (!name) {
      return warning(path, `Malformed requirement on line ${index + 1}.`);
    }

    dependencies.push(name);
  }

  return {
    ok: true,
    manifest: {
      path,
      dependencies,
      optionalDependencies: {},
      toolHints: []
    }
  };
}

function parseSetupFile(path: string, text: string): ParsePythonManifestResult {
  return {
    ok: true,
    manifest: {
      path,
      projectName: stringAssignment(text, "name"),
      dependencies: [...text.matchAll(/['"]([A-Za-z0-9_.-]+)(?:[<>=!~].*)?['"]/g)]
        .map((match) => match[1])
        .filter((value): value is string => value !== undefined),
      optionalDependencies: {},
      toolHints: []
    }
  };
}

function manifestFacts(manifest: PythonManifest, text: string): readonly ScannerFact[] {
  const facts: ScannerFact[] = [];

  if (manifest.projectName) {
    facts.push(
      createScannerFact({
        kind: "application.detected",
        value: {
          name: manifest.projectName,
          path: packageRoot(manifest.path),
          kind: "python-package"
        },
        confidence: "high",
        detector: detectorName,
        evidence: [
          createEvidenceFromLocation({
            kind: "config",
            sourcePath: manifest.path,
            detector: detectorName,
            location: findRegexLocation(text, /^\s*name\s*=/)
          })
        ]
      })
    );
  }

  if (manifest.path.endsWith("pyproject.toml")) {
    facts.push(...pyprojectPackageManagerFacts(manifest, text));
  }

  if (manifest.path.includes("requirements")) {
    facts.push(packageManagerFact("pip", "medium", manifest.path));
  }

  for (const dependency of allDependencies(manifest)) {
    const normalized = normalizePackageName(dependency);
    const framework = frameworkPackages.get(normalized);
    const database = databasePackages.get(normalized);

    if (framework) {
      facts.push(frameworkFact(framework, dependency, manifest.path, text));
    }

    if (database) {
      facts.push(databaseFact(database, dependency, manifest.path, text));
    }

    if (normalized === "redis") {
      facts.push(cacheFact("redis", dependency, manifest.path, text));
    }
  }

  return facts;
}

function pyprojectPackageManagerFacts(
  manifest: PythonManifest,
  text: string
): readonly ScannerFact[] {
  const facts: ScannerFact[] = [];

  if (manifest.toolHints.includes("tool.poetry")) {
    facts.push(
      packageManagerFact("poetry", "high", manifest.path, findStringLocation(text, "[tool.poetry]"))
    );
  }

  if (manifest.path.endsWith("pyproject.toml") && text.includes("[dependency-groups]")) {
    facts.push(
      packageManagerFact(
        "uv",
        "high",
        manifest.path,
        findStringLocation(text, "[dependency-groups]")
      )
    );
  }

  return facts;
}

function lockfileFacts(context: ScanContext): readonly ScannerFact[] {
  const facts: ScannerFact[] = [];

  if (context.inventory.files.some((path) => path.endsWith("poetry.lock"))) {
    facts.push(packageManagerFact("poetry", "high", "poetry.lock"));
  }

  if (context.inventory.files.some((path) => path.endsWith("uv.lock"))) {
    facts.push(packageManagerFact("uv", "high", "uv.lock"));
  }

  return facts;
}

function packageManagerFact(
  name: string,
  confidence: "high" | "medium",
  path: string,
  location = { line_start: 1, line_end: 1 }
): ScannerFact {
  return createScannerFact({
    kind: "package_manager.detected",
    value: {
      name,
      primary: confidence === "high"
    },
    confidence,
    detector: detectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: "config",
        sourcePath: path,
        detector: detectorName,
        location
      })
    ]
  });
}

function frameworkFact(name: string, dependency: string, path: string, text: string): ScannerFact {
  return createScannerFact({
    kind: "framework.detected",
    value: {
      name,
      language: "python",
      package: normalizePackageName(dependency)
    },
    confidence: "high",
    detector: detectorName,
    evidence: [dependencyEvidence(path, text, dependency)]
  });
}

function databaseFact(name: string, dependency: string, path: string, text: string): ScannerFact {
  return createScannerFact({
    kind: "database.dependency_detected",
    value: {
      name,
      kind: "database",
      package: normalizePackageName(dependency)
    },
    confidence: "high",
    detector: detectorName,
    evidence: [dependencyEvidence(path, text, dependency)]
  });
}

function cacheFact(name: string, dependency: string, path: string, text: string): ScannerFact {
  return createScannerFact({
    kind: "cache.dependency_detected",
    value: {
      name,
      package: normalizePackageName(dependency)
    },
    confidence: "high",
    detector: detectorName,
    evidence: [dependencyEvidence(path, text, dependency)]
  });
}

function dependencyEvidence(path: string, text: string, dependency: string) {
  return createEvidenceFromLocation({
    kind: "config",
    sourcePath: path,
    detector: detectorName,
    location: findStringLocation(text, dependency)
  });
}

function pythonManifestPaths(context: ScanContext): readonly string[] {
  return context.inventory.files.filter(
    (path) =>
      path.endsWith("pyproject.toml") ||
      path.endsWith("requirements.txt") ||
      path.endsWith("requirements-dev.txt") ||
      path.endsWith("requirements.in") ||
      path.endsWith("setup.py") ||
      path.endsWith("setup.cfg")
  );
}

function allDependencies(manifest: PythonManifest): readonly string[] {
  return [
    ...manifest.dependencies,
    ...Object.values(manifest.optionalDependencies).flatMap((dependencies) => dependencies)
  ];
}

function arraySectionValues(text: string, key: string): readonly string[] {
  const match = text.match(new RegExp(`^${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m"));

  if (!match?.[1]) {
    return [];
  }

  return [...match[1].matchAll(/["']([^"']+)["']/g)]
    .map((item) => packageNameFromRequirement(item[1] ?? ""))
    .filter((value): value is string => value !== undefined);
}

function sectionDependencyValues(text: string, section: string): readonly string[] {
  const sectionMatch = text.match(
    new RegExp(`^\\[${section.replaceAll(".", "\\.")}\\]\\s*\\n([\\s\\S]*?)(?=^\\[|$)`, "m")
  );

  if (!sectionMatch?.[1]) {
    return [];
  }

  return [...sectionMatch[1].matchAll(/^([A-Za-z0-9_.-]+)\s*=/gm)]
    .map((match) => match[1]!)
    .filter(Boolean);
}

function optionalDependencyGroups(text: string): Readonly<Record<string, readonly string[]>> {
  const groups: Record<string, readonly string[]> = {};

  for (const match of text.matchAll(
    /^\[project\.optional-dependencies\]\s*\n([\s\S]*?)(?=^\[|$)/gm
  )) {
    const body = match[1] ?? "";

    for (const group of body.matchAll(/^([A-Za-z0-9_.-]+)\s*=\s*\[([\s\S]*?)\]/gm)) {
      if (group[1] && group[2]) {
        groups[group[1]] = [...group[2].matchAll(/["']([^"']+)["']/g)]
          .map((item) => packageNameFromRequirement(item[1] ?? ""))
          .filter((value): value is string => value !== undefined);
      }
    }
  }

  return groups;
}

function stringAssignment(text: string, key: string): string | undefined {
  return text.match(new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, "m"))?.[1];
}

function packageNameFromRequirement(requirement: string): string | undefined {
  const match = requirement.trim().match(/^([A-Za-z0-9_.-]+)/);

  return match?.[1];
}

function normalizePackageName(name: string): string {
  return name.toLowerCase().replaceAll("_", "-");
}

function packageRoot(path: string): string {
  return path.includes("/") ? path.split("/").slice(0, -1).join("/") : ".";
}

function hasLikelyTomlSyntaxError(text: string): boolean {
  return text.split(/\r?\n/).some((line) => {
    const quoteCount = [...line].filter((character) => character === '"').length;

    return quoteCount % 2 === 1;
  });
}

function warning(path: string, message: string): ParsePythonManifestResult {
  return {
    ok: false,
    warning: {
      detector: detectorName,
      path,
      message
    }
  };
}

function dedupeFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  const seen = new Set<string>();

  return facts.filter((fact) => {
    const value = fact.value as { name?: string; package?: string; path?: string };
    const key = `${fact.kind}:${value.name ?? value.path ?? ""}:${value.package ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
