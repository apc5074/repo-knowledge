import type { RepositoryDetector, ScanWarning } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import {
  parseJavaScriptPackageManifest,
  type JavaScriptPackageManifest
} from "./javascript-manifest.js";
import { createEvidenceFromLocation, findConfigKeyLocation } from "./source-location.js";

const detectorName = "javascript-command";

const knownScriptPurposes: Readonly<Record<string, string>> = {
  dev: "development",
  start: "start",
  build: "build",
  test: "test",
  "test:unit": "test",
  "test:integration": "test",
  lint: "lint",
  typecheck: "typecheck",
  migrate: "migration",
  "db:migrate": "migration",
  seed: "seed",
  "db:seed": "seed",
  healthcheck: "healthcheck"
};

export function createJavaScriptCommandDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["command.detected"],
    filePatterns: ["package.json"],
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

        facts.push(...commandFacts(parsed.manifest, result.text));
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

function commandFacts(manifest: JavaScriptPackageManifest, text: string): readonly ScannerFact[] {
  return Object.entries(manifest.scripts)
    .filter(([name]) => knownScriptPurposes[name] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, command]) =>
      createScannerFact({
        kind: "command.detected",
        value: {
          name,
          command,
          category: knownScriptPurposes[name],
          cwd: packageRoot(manifest.path),
          packageManager: parsePackageManagerName(manifest.packageManager)
        },
        confidence: "high",
        detector: detectorName,
        evidence: [
          createEvidenceFromLocation({
            kind: "config",
            sourcePath: manifest.path,
            detector: detectorName,
            location: findConfigKeyLocation(text, name) ?? findConfigKeyLocation(text, "scripts")
          })
        ]
      })
    );
}

function packageRoot(path: string): string {
  return path.endsWith("/package.json") ? path.slice(0, -"/package.json".length) : ".";
}

function parsePackageManagerName(packageManager: string | undefined): string | undefined {
  return packageManager?.split("@")[0];
}
