import type { RepositoryDetector, ScanWarning } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { createEvidenceFromLocation, type SourceLocation } from "./source-location.js";

const detectorName = "python-route-file";

type RouteSignal = {
  readonly path: string;
  readonly framework: "FastAPI" | "Flask" | "Django";
  readonly route?: string;
  readonly location: SourceLocation;
};

export function createPythonRouteDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["api.route_file_detected"],
    filePatterns: ["*.py"],
    run: async (context) => {
      const facts: ScannerFact[] = [];
      const warnings: ScanWarning[] = [];

      for (const path of context.inventory.files.filter((candidate) => candidate.endsWith(".py"))) {
        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        const analysis = routeSignals(path, result.text);
        warnings.push(...analysis.warnings);
        facts.push(...analysis.signals.map(routeFact));
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

function routeSignals(
  path: string,
  text: string
): { signals: readonly RouteSignal[]; warnings: readonly ScanWarning[] } {
  const signals: RouteSignal[] = [];
  const warnings: ScanWarning[] = [];

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    const route = routeFromDecorator(trimmed);

    if (route) {
      signals.push({
        path,
        framework:
          trimmed.startsWith("@app.route") || trimmed.includes(".route(") ? "Flask" : "FastAPI",
        route,
        location: {
          line_start: lineNumber,
          line_end: lineNumber,
          excerpt: trimmed
        }
      });
    }

    const djangoRoute = routeFromDjangoUrl(trimmed);

    if (djangoRoute || path.endsWith("urls.py")) {
      if (djangoRoute) {
        signals.push({
          path,
          framework: "Django",
          route: djangoRoute,
          location: {
            line_start: lineNumber,
            line_end: lineNumber,
            excerpt: trimmed
          }
        });
      }
    }

    if (/^(def|class)\s+\w+.*[^:]$/.test(trimmed)) {
      warnings.push({
        detector: detectorName,
        path,
        message: `Possible Python syntax error on line ${lineNumber}.`
      });
    }
  }

  if (path.endsWith("urls.py") && !signals.some((signal) => signal.framework === "Django")) {
    signals.push({
      path,
      framework: "Django",
      location: {
        line_start: 1,
        line_end: 1
      }
    });
  }

  return {
    signals,
    warnings
  };
}

function routeFact(signal: RouteSignal): ScannerFact {
  return createScannerFact({
    kind: "api.route_file_detected",
    value: {
      path: signal.path,
      framework: signal.framework,
      route: signal.route
    },
    confidence: "high",
    detector: detectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: "source",
        sourcePath: signal.path,
        detector: detectorName,
        location: signal.location
      })
    ]
  });
}

function routeFromDecorator(line: string): string | undefined {
  return line.match(
    /^@\w+\.(?:get|post|put|patch|delete|options|head|route)\(\s*["']([^"']+)["']/
  )?.[1];
}

function routeFromDjangoUrl(line: string): string | undefined {
  return line.match(/\b(?:path|re_path)\(\s*["']([^"']*)["']/)?.[1];
}

function dedupeFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  const seen = new Set<string>();

  return facts.filter((fact) => {
    const value = fact.value as { path?: string; framework?: string; route?: string };
    const key = `${value.path ?? ""}:${value.framework ?? ""}:${value.route ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
