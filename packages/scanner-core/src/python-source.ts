import type { RepositoryDetector, ScanContext, ScanWarning } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { createEvidenceFromLocation, type SourceLocation } from "./source-location.js";

const frameworkDetectorName = "python-framework";
const entrypointDetectorName = "python-source";

export type PythonImportSignal = {
  readonly module: string;
  readonly line: number;
};

export type PythonDeclarationSignal = {
  readonly kind: "fastapi" | "flask" | "celery" | "main-guard" | "django-manage";
  readonly name?: string;
  readonly line: number;
};

export type PythonSourceAnalysis = {
  readonly path: string;
  readonly imports: readonly PythonImportSignal[];
  readonly declarations: readonly PythonDeclarationSignal[];
  readonly warnings: readonly ScanWarning[];
};

const frameworkImports = new Map([
  ["fastapi", "FastAPI"],
  ["flask", "Flask"],
  ["django", "Django"],
  ["celery", "Celery"],
  ["pytest", "pytest"],
  ["sqlalchemy", "SQLAlchemy"],
  ["alembic", "Alembic"]
]);
const databaseImports = new Map([
  ["psycopg", "postgresql"],
  ["psycopg2", "postgresql"],
  ["asyncpg", "postgresql"],
  ["sqlalchemy", "database"]
]);

export function analyzePythonSource(path: string, text: string): PythonSourceAnalysis {
  const imports: PythonImportSignal[] = [];
  const declarations: PythonDeclarationSignal[] = [];
  const warnings: ScanWarning[] = [];
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    const importModule = importedModule(trimmed);

    if (importModule) {
      imports.push({
        module: importModule,
        line: lineNumber
      });
    }

    if (/=\s*FastAPI\s*\(/.test(trimmed)) {
      declarations.push({
        kind: "fastapi",
        name: leftHandName(trimmed),
        line: lineNumber
      });
    }

    if (/=\s*Flask\s*\(/.test(trimmed)) {
      declarations.push({
        kind: "flask",
        name: leftHandName(trimmed),
        line: lineNumber
      });
    }

    if (/=\s*Celery\s*\(/.test(trimmed)) {
      declarations.push({
        kind: "celery",
        name: leftHandName(trimmed),
        line: lineNumber
      });
    }

    if (/if\s+__name__\s*==\s*["']__main__["']\s*:/.test(trimmed)) {
      declarations.push({
        kind: "main-guard",
        line: lineNumber
      });
    }

    if (hasLikelySyntaxError(trimmed)) {
      warnings.push({
        detector: entrypointDetectorName,
        path,
        message: `Possible Python syntax error on line ${lineNumber}.`
      });
    }
  }

  if (path.endsWith("manage.py")) {
    declarations.push({
      kind: "django-manage",
      line: 1
    });
  }

  return {
    path,
    imports,
    declarations,
    warnings
  };
}

export function createPythonFrameworkDetector(): RepositoryDetector {
  return {
    name: frameworkDetectorName,
    version: "0.0.0",
    emittedFactKinds: ["framework.detected", "application.detected"],
    filePatterns: ["*.py"],
    run: async (context) => {
      const facts: ScannerFact[] = [];
      const warnings: ScanWarning[] = [];

      for (const path of pythonSourcePaths(context)) {
        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        const analysis = analyzePythonSource(path, result.text);
        warnings.push(
          ...analysis.warnings.map((warning) => ({ ...warning, detector: frameworkDetectorName }))
        );
        facts.push(...frameworkFacts(analysis));
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

export function createPythonSourceDetector(): RepositoryDetector {
  return {
    name: entrypointDetectorName,
    version: "0.0.0",
    emittedFactKinds: [
      "entrypoint.detected",
      "database.dependency_detected",
      "cache.dependency_detected"
    ],
    filePatterns: ["*.py"],
    run: async (context) => {
      const facts: ScannerFact[] = [];
      const warnings: ScanWarning[] = [];

      for (const path of pythonSourcePaths(context)) {
        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        const analysis = analyzePythonSource(path, result.text);
        warnings.push(...analysis.warnings);
        facts.push(...entrypointFacts(analysis), ...dependencyFacts(analysis));
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

function frameworkFacts(analysis: PythonSourceAnalysis): readonly ScannerFact[] {
  const facts: ScannerFact[] = [];

  for (const importSignal of analysis.imports) {
    const framework = frameworkImports.get(normalizeModuleName(importSignal.module));

    if (framework) {
      facts.push(
        frameworkFact(framework, importSignal.module, analysis.path, importSignal.line, "high")
      );
    }
  }

  for (const declaration of analysis.declarations) {
    const framework = declarationFramework(declaration.kind);

    if (!framework) {
      continue;
    }

    facts.push(
      frameworkFact(
        framework,
        declarationPackageName(declaration.kind) ?? declaration.kind,
        analysis.path,
        declaration.line,
        "high"
      )
    );
    facts.push(applicationFact(framework, declaration, analysis.path));
  }

  return facts;
}

function entrypointFacts(analysis: PythonSourceAnalysis): readonly ScannerFact[] {
  return analysis.declarations
    .filter((declaration) => entrypointKind(declaration.kind) !== undefined)
    .map((declaration) =>
      createScannerFact({
        kind: "entrypoint.detected",
        value: {
          path: analysis.path,
          runtime: "python",
          application: declaration.name,
          kind: entrypointKind(declaration.kind)
        },
        confidence: "high",
        detector: entrypointDetectorName,
        evidence: [
          createEvidenceFromLocation({
            kind: "source",
            sourcePath: analysis.path,
            detector: entrypointDetectorName,
            location: lineLocation(declaration.line)
          })
        ]
      })
    );
}

function dependencyFacts(analysis: PythonSourceAnalysis): readonly ScannerFact[] {
  const facts: ScannerFact[] = [];

  for (const importSignal of analysis.imports) {
    const normalized = normalizeModuleName(importSignal.module);
    const database = databaseImports.get(normalized);

    if (database) {
      facts.push(
        createScannerFact({
          kind: "database.dependency_detected",
          value: {
            name: database,
            kind: "database",
            package: normalized
          },
          confidence: "medium",
          detector: entrypointDetectorName,
          evidence: [
            createEvidenceFromLocation({
              kind: "source",
              sourcePath: analysis.path,
              detector: entrypointDetectorName,
              location: lineLocation(importSignal.line)
            })
          ]
        })
      );
    }

    if (normalized === "redis") {
      facts.push(
        createScannerFact({
          kind: "cache.dependency_detected",
          value: {
            name: "redis",
            package: normalized
          },
          confidence: "medium",
          detector: entrypointDetectorName,
          evidence: [
            createEvidenceFromLocation({
              kind: "source",
              sourcePath: analysis.path,
              detector: entrypointDetectorName,
              location: lineLocation(importSignal.line)
            })
          ]
        })
      );
    }
  }

  return facts;
}

function frameworkFact(
  name: string,
  packageName: string,
  path: string,
  line: number,
  confidence: "high" | "medium"
): ScannerFact {
  return createScannerFact({
    kind: "framework.detected",
    value: {
      name,
      language: "python",
      package: normalizeModuleName(packageName)
    },
    confidence,
    detector: frameworkDetectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: "source",
        sourcePath: path,
        detector: frameworkDetectorName,
        location: lineLocation(line)
      })
    ]
  });
}

function applicationFact(
  framework: string,
  declaration: PythonDeclarationSignal,
  path: string
): ScannerFact {
  return createScannerFact({
    kind: "application.detected",
    value: {
      name: declaration.name ?? framework.toLowerCase(),
      path,
      kind: declaration.kind === "celery" ? "worker" : "api-service",
      framework
    },
    confidence: "high",
    detector: frameworkDetectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: "source",
        sourcePath: path,
        detector: frameworkDetectorName,
        location: lineLocation(declaration.line)
      })
    ]
  });
}

function pythonSourcePaths(context: ScanContext): readonly string[] {
  return context.inventory.files.filter((path) => path.endsWith(".py"));
}

function importedModule(line: string): string | undefined {
  const importMatch = line.match(/^import\s+([A-Za-z_][A-Za-z0-9_]*)(?:[.\s]|$)/);

  if (importMatch?.[1]) {
    return importMatch[1];
  }

  return line.match(/^from\s+([A-Za-z_][A-Za-z0-9_]*)(?:\.|\s+import\s+)/)?.[1];
}

function leftHandName(line: string): string | undefined {
  return line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
}

function declarationFramework(kind: PythonDeclarationSignal["kind"]): string | undefined {
  if (kind === "fastapi") {
    return "FastAPI";
  }

  if (kind === "flask") {
    return "Flask";
  }

  if (kind === "celery") {
    return "Celery";
  }

  if (kind === "django-manage") {
    return "Django";
  }

  return undefined;
}

function declarationPackageName(kind: PythonDeclarationSignal["kind"]): string | undefined {
  if (kind === "fastapi" || kind === "flask" || kind === "celery") {
    return kind;
  }

  if (kind === "django-manage") {
    return "django";
  }

  return undefined;
}

function entrypointKind(kind: PythonDeclarationSignal["kind"]): string | undefined {
  if (kind === "main-guard") {
    return "python-main";
  }

  if (kind === "django-manage") {
    return "django-manage";
  }

  if (kind === "celery") {
    return "celery-app";
  }

  if (kind === "fastapi" || kind === "flask") {
    return "wsgi-asgi-app";
  }

  return undefined;
}

function normalizeModuleName(name: string): string {
  return name.toLowerCase().replaceAll("_", "-");
}

function lineLocation(line: number): SourceLocation {
  return {
    line_start: line,
    line_end: line
  };
}

function hasLikelySyntaxError(line: string): boolean {
  return /^(def|class)\s+\w+.*[^:]$/.test(line);
}

function dedupeFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  const seen = new Set<string>();

  return facts.filter((fact) => {
    const value = fact.value as { name?: string; path?: string; package?: string; kind?: string };
    const key = `${fact.kind}:${value.name ?? ""}:${value.path ?? ""}:${value.package ?? ""}:${value.kind ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
