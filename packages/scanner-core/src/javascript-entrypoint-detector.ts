import type { RepositoryDetector, ScanContext, ScanWarning } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import {
  parseJavaScriptPackageManifest,
  type JavaScriptPackageManifest
} from "./javascript-manifest.js";
import { createEvidenceFromLocation, findConfigKeyLocation } from "./source-location.js";

const detectorName = "javascript-entrypoint";

type EntrypointSignal = {
  readonly path: string;
  readonly runtime?: string;
  readonly command?: string;
  readonly application?: string;
  readonly confidence: "high" | "medium";
  readonly evidencePath: string;
};

const commonEntrypointNames = [
  "src/server.ts",
  "src/server.js",
  "src/index.ts",
  "src/index.js",
  "src/main.ts",
  "src/main.tsx",
  "src/main.js",
  "pages/index.tsx",
  "pages/index.jsx",
  "app/page.tsx",
  "app/page.jsx"
] as const;

export function createJavaScriptEntrypointDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["entrypoint.detected"],
    filePatterns: [
      "package.json",
      "src/index.*",
      "src/server.*",
      "src/main.*",
      "pages/**",
      "app/**"
    ],
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

        facts.push(...manifestEntrypointFacts(parsed.manifest, result.text, context));
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

function manifestEntrypointFacts(
  manifest: JavaScriptPackageManifest,
  text: string,
  context: ScanContext
): readonly ScannerFact[] {
  const signals: EntrypointSignal[] = [];
  const root = packageRoot(manifest.path);

  if (manifest.main) {
    signals.push({
      path: resolvePackagePath(root, manifest.main),
      runtime: "node",
      application: manifest.name,
      confidence: "high",
      evidencePath: manifest.path
    });
  }

  for (const binPath of manifest.bin) {
    signals.push({
      path: resolvePackagePath(root, binPath),
      runtime: "node",
      application: manifest.name,
      confidence: "high",
      evidencePath: manifest.path
    });
  }

  for (const exportPath of manifest.exports) {
    if (looksLikeLocalFile(exportPath)) {
      signals.push({
        path: resolvePackagePath(root, exportPath),
        runtime: "node",
        application: manifest.name,
        confidence: "high",
        evidencePath: manifest.path
      });
    }
  }

  for (const [name, command] of Object.entries(manifest.scripts)) {
    const commandTarget = findCommandTarget(command);

    if (commandTarget) {
      signals.push({
        path: resolvePackagePath(root, commandTarget),
        runtime: "node",
        command,
        application: manifest.name,
        confidence: name.includes("worker") ? "high" : "medium",
        evidencePath: manifest.path
      });
    }
  }

  for (const commonPath of commonEntrypointNames) {
    const candidate = resolvePackagePath(root, commonPath);

    if (context.inventory.files.includes(candidate)) {
      signals.push({
        path: candidate,
        runtime: candidate.endsWith(".tsx") || candidate.endsWith(".jsx") ? "browser" : "node",
        application: manifest.name,
        confidence: "medium",
        evidencePath: candidate
      });
    }
  }

  return signals
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((signal) =>
      createScannerFact({
        kind: "entrypoint.detected",
        value: {
          path: signal.path,
          runtime: signal.runtime,
          command: signal.command,
          application: signal.application
        },
        confidence: signal.confidence,
        detector: detectorName,
        evidence: [
          createEvidenceFromLocation({
            kind: signal.evidencePath === signal.path ? "source" : "config",
            sourcePath: signal.evidencePath,
            detector: detectorName,
            location:
              signal.evidencePath === manifest.path
                ? (findConfigKeyLocation(text, "main") ??
                  findConfigKeyLocation(text, "bin") ??
                  findConfigKeyLocation(text, "exports") ??
                  findConfigKeyLocation(text, "scripts"))
                : { line_start: 1, line_end: 1 }
          })
        ]
      })
    );
}

function dedupeFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  const seen = new Set<string>();

  return facts.filter((fact) => {
    const key = `${(fact.value as { path?: string }).path ?? fact.id}:${fact.detector}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function packageRoot(path: string): string {
  return path.endsWith("/package.json") ? path.slice(0, -"/package.json".length) : ".";
}

function resolvePackagePath(root: string, path: string): string {
  const normalized = path.replace(/^\.\//, "");

  return root === "." ? normalized : `${root}/${normalized}`;
}

function looksLikeLocalFile(path: string): boolean {
  return path.startsWith("./") || path.startsWith("src/") || path.startsWith("dist/");
}

function findCommandTarget(command: string): string | undefined {
  const match = command.match(/\b(?:node|tsx|ts-node|vite-node)\s+([^\s;&|]+)/);

  return match?.[1]?.replace(/^\.\//, "");
}
