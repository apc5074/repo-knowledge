import type { RepositoryDetector, ScanContext, ScanWarning } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import {
  parseJavaScriptPackageManifest,
  type JavaScriptPackageManifest
} from "./javascript-manifest.js";
import {
  createEvidenceFromLocation,
  findConfigKeyLocation,
  type SourceLocation
} from "./source-location.js";

const detectorName = "javascript-framework";

type FrameworkName =
  "next.js" | "vite" | "express" | "fastify" | "nestjs" | "react" | "node-cli" | "node-worker";

type FrameworkSignal = {
  readonly name: FrameworkName;
  readonly packageName?: string;
  readonly version?: string;
  readonly language?: string;
  readonly applicationKind?: string;
  readonly confidence: "high" | "medium" | "low";
  readonly path: string;
  readonly location?: SourceLocation;
};

export function createJavaScriptFrameworkDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["framework.detected", "application.detected"],
    filePatterns: ["package.json", "next.config.*", "vite.config.*"],
    run: async (context) => {
      const facts: ScannerFact[] = [];
      const warnings: ScanWarning[] = [];

      for (const path of context.inventory.files.filter((candidate) =>
        candidate.endsWith("package.json")
      )) {
        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        const parsed = parseJavaScriptPackageManifest(path, result.text);

        if (!parsed.ok) {
          warnings.push({
            ...parsed.warning,
            detector: detectorName
          });
          continue;
        }

        facts.push(...frameworkFacts(parsed.manifest, result.text, context));
      }

      return {
        facts,
        warnings,
        stats: {
          files_considered: context.inventory.files.length,
          facts_emitted: facts.length
        }
      };
    }
  };
}

function frameworkFacts(
  manifest: JavaScriptPackageManifest,
  text: string,
  context: ScanContext
): readonly ScannerFact[] {
  const signals = collectFrameworkSignals(manifest, text, context);
  const facts: ScannerFact[] = signals.map(frameworkFact);

  for (const signal of signals.filter((candidate) => candidate.applicationKind)) {
    facts.push(applicationFact(signal, manifest));
  }

  return facts;
}

function collectFrameworkSignals(
  manifest: JavaScriptPackageManifest,
  text: string,
  context: ScanContext
): readonly FrameworkSignal[] {
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies
  };
  const signals: FrameworkSignal[] = [];

  addDependencySignal(signals, manifest, text, dependencies, "next.js", "next", "web-app");
  addDependencySignal(signals, manifest, text, dependencies, "vite", "vite", "frontend-app");
  addDependencySignal(signals, manifest, text, dependencies, "express", "express", "api-service");
  addDependencySignal(signals, manifest, text, dependencies, "fastify", "fastify", "api-service");
  addDependencySignal(
    signals,
    manifest,
    text,
    dependencies,
    "nestjs",
    "@nestjs/core",
    "api-service"
  );
  addDependencySignal(signals, manifest, text, dependencies, "react", "react", "frontend-library");

  if (manifest.bin.length > 0) {
    signals.push({
      name: "node-cli",
      language: "javascript",
      applicationKind: "cli",
      confidence: "high",
      path: manifest.path,
      location: findConfigKeyLocation(text, "bin")
    });
  }

  const workerScript = Object.entries(manifest.scripts).find(([name, command]) =>
    /\b(worker|queue|job|bullmq|agenda)\b/i.test(`${name} ${command}`)
  );

  if (workerScript) {
    signals.push({
      name: "node-worker",
      language: "javascript",
      applicationKind: "worker",
      confidence: "medium",
      path: manifest.path,
      location: findConfigKeyLocation(text, workerScript[0])
    });
  }

  const packageRootPath = packageRoot(manifest.path);
  const packagePrefix = packageRootPath === "." ? "" : `${packageRootPath}/`;

  if (
    !signals.some((signal) => signal.name === "vite") &&
    context.inventory.files.some(
      (path) => path.startsWith(packagePrefix) && /(^|\/)vite\.config\./.test(path)
    )
  ) {
    const path = context.inventory.files.find(
      (candidate) => candidate.startsWith(packagePrefix) && /(^|\/)vite\.config\./.test(candidate)
    )!;
    signals.push(configSignal("vite", path, "frontend-app"));
  }

  if (
    !signals.some((signal) => signal.name === "next.js") &&
    context.inventory.files.some(
      (path) => path.startsWith(packagePrefix) && /(^|\/)next\.config\./.test(path)
    )
  ) {
    const path = context.inventory.files.find(
      (candidate) => candidate.startsWith(packagePrefix) && /(^|\/)next\.config\./.test(candidate)
    )!;
    signals.push(configSignal("next.js", path, "web-app"));
  }

  return signals.sort((left, right) => left.name.localeCompare(right.name));
}

function addDependencySignal(
  signals: FrameworkSignal[],
  manifest: JavaScriptPackageManifest,
  text: string,
  dependencies: Readonly<Record<string, string>>,
  name: FrameworkName,
  packageName: string,
  applicationKind: string
): void {
  const version = dependencies[packageName];

  if (!version) {
    return;
  }

  signals.push({
    name,
    packageName,
    version,
    language: "javascript",
    applicationKind,
    confidence: "high",
    path: manifest.path,
    location: findConfigKeyLocation(text, packageName)
  });
}

function configSignal(name: FrameworkName, path: string, applicationKind: string): FrameworkSignal {
  return {
    name,
    language: "javascript",
    applicationKind,
    confidence: "medium",
    path,
    location: {
      line_start: 1,
      line_end: 1
    }
  };
}

function frameworkFact(signal: FrameworkSignal): ScannerFact {
  return createScannerFact({
    kind: "framework.detected",
    value: {
      name: signal.name,
      language: signal.language,
      version: signal.version,
      package: signal.packageName
    },
    confidence: signal.confidence,
    detector: detectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: "config",
        sourcePath: signal.path,
        detector: detectorName,
        location: signal.location
      })
    ]
  });
}

function applicationFact(
  signal: FrameworkSignal,
  manifest: JavaScriptPackageManifest
): ScannerFact {
  return createScannerFact({
    kind: "application.detected",
    value: {
      name: manifest.name ?? packageRoot(manifest.path),
      path: packageRoot(manifest.path),
      kind: signal.applicationKind,
      framework: signal.name
    },
    confidence: signal.confidence,
    detector: detectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: "config",
        sourcePath: signal.path,
        detector: detectorName,
        location: signal.location
      })
    ]
  });
}

function packageRoot(path: string): string {
  return path.endsWith("/package.json") ? path.slice(0, -"/package.json".length) : ".";
}
