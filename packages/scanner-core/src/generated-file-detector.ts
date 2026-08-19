import type { RepositoryDetector } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { parseJavaScriptPackageManifest } from "./javascript-manifest.js";
import {
  createEvidenceFromLocation,
  findConfigKeyLocation,
  findRegexLocation
} from "./source-location.js";

const detectorName = "generated-file";

const lockfileNames = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "uv.lock",
  "poetry.lock",
  "Cargo.lock",
  "go.sum"
]);

export type GeneratedPathCandidate = {
  readonly path: string;
  readonly generator?: string;
  readonly regenerationCommand?: string;
  readonly reason: string;
  readonly confidence: "high" | "medium";
  readonly evidencePath: string;
};

export function createGeneratedFileDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["generated.path_detected"],
    filePatterns: ["package.json", "*generated*", "*lock*", "gen/**", "generated/**"],
    run: async (context) => {
      const generationCommands = new Map<string, string>();
      const facts: ScannerFact[] = [];

      for (const path of context.inventory.files.filter((candidate) =>
        candidate.endsWith("package.json")
      )) {
        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        for (const [name, command] of generationScripts(path, result.text)) {
          generationCommands.set(packageRoot(path), command);
          facts.push(generatedFact(scriptCandidate(path, name, command), result.text, name));
        }
      }

      for (const path of context.inventory.files) {
        const candidate = generatedPathCandidate(path, generationCommands);

        if (!candidate) {
          continue;
        }

        const result = await context.readFileIfSafe(candidate.evidencePath);
        facts.push(generatedFact(candidate, result.ok ? result.text : ""));
      }

      return {
        facts: dedupeFacts(facts),
        stats: {
          files_considered: context.inventory.files.length,
          facts_emitted: facts.length
        }
      };
    }
  };
}

function generationScripts(path: string, text: string): readonly [string, string][] {
  const parsed = parseJavaScriptPackageManifest(path, text);

  if (!parsed.ok) {
    return [];
  }

  return Object.entries(parsed.manifest.scripts).filter(([name, command]) =>
    /\b(generate|codegen|openapi|graphql-codegen)\b/i.test(`${name} ${command}`)
  );
}

function scriptCandidate(path: string, name: string, command: string): GeneratedPathCandidate {
  return {
    path,
    generator: "package-script",
    regenerationCommand: command,
    reason: `generation script: ${name}`,
    confidence: "high",
    evidencePath: path
  };
}

function generatedPathCandidate(
  path: string,
  generationCommands: ReadonlyMap<string, string>
): GeneratedPathCandidate | undefined {
  const name = path.split("/").at(-1) ?? path;

  if (lockfileNames.has(name)) {
    return {
      path,
      generator: "package-manager",
      reason: "lockfile",
      confidence: "high",
      evidencePath: path
    };
  }

  const generatedRoot = generatedDirectoryRoot(path);

  if (generatedRoot) {
    return {
      path: generatedRoot,
      generator: generatorForPath(path),
      regenerationCommand: commandForPath(path, generationCommands),
      reason: "generated directory",
      confidence: "high",
      evidencePath: path
    };
  }

  if (/\.(generated|gen)\./.test(path) || /graphql\.ts$|openapi.*\.[jt]s$/i.test(path)) {
    return {
      path,
      generator: generatorForPath(path),
      regenerationCommand: commandForPath(path, generationCommands),
      reason: "generated filename",
      confidence: "medium",
      evidencePath: path
    };
  }

  return undefined;
}

function generatedFact(
  candidate: GeneratedPathCandidate,
  text: string,
  scriptName?: string
): ScannerFact {
  return createScannerFact({
    kind: "generated.path_detected",
    value: {
      path: candidate.path,
      generator: candidate.generator,
      regenerationCommand: candidate.regenerationCommand,
      reason: candidate.reason,
      managed: candidate.reason === "lockfile"
    },
    confidence: candidate.confidence,
    detector: detectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: "config",
        sourcePath: candidate.evidencePath,
        detector: detectorName,
        location: (scriptName ? findConfigKeyLocation(text, scriptName) : undefined) ??
          findRegexLocation(text, /generated|codegen|openapi|graphql-codegen|lockfile/i) ?? {
            line_start: 1,
            line_end: 1,
            excerpt: candidate.evidencePath
          }
      })
    ]
  });
}

function generatedDirectoryRoot(path: string): string | undefined {
  const parts = path.split("/");
  const index = parts.findIndex((part) => /^(generated|__generated__|gen)$/.test(part));

  if (index === -1) {
    return undefined;
  }

  return parts.slice(0, index + 1).join("/");
}

function generatorForPath(path: string): string | undefined {
  if (/prisma/i.test(path)) {
    return "prisma";
  }

  if (/openapi/i.test(path)) {
    return "openapi";
  }

  if (/graphql|gql/i.test(path)) {
    return "graphql-codegen";
  }

  return undefined;
}

function commandForPath(path: string, commands: ReadonlyMap<string, string>): string | undefined {
  const matchingRoot = [...commands.keys()]
    .filter((root) => root === "." || path === root || path.startsWith(`${root}/`))
    .sort((left, right) => right.length - left.length)[0];

  return matchingRoot ? commands.get(matchingRoot) : commands.get(".");
}

function packageRoot(path: string): string {
  return path.endsWith("/package.json") ? path.slice(0, -"/package.json".length) : ".";
}

function dedupeFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  const seen = new Set<string>();

  return facts.filter((fact) => {
    const value = fact.value as { path?: string; regenerationCommand?: string };
    const key = `${value.path ?? fact.id}:${value.regenerationCommand ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
