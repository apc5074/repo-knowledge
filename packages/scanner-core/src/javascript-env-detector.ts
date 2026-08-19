import type { RepositoryDetector } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import {
  createEvidenceFromLocation,
  findRegexLocation,
  type SourceLocation
} from "./source-location.js";

const detectorName = "javascript-env";

const processEnvPatterns = [
  /process\.env\.([A-Z_][A-Z0-9_]*)/g,
  /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g
] as const;

export function createJavaScriptEnvDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["environment.variable_detected"],
    filePatterns: ["*.js", "*.jsx", "*.ts", "*.tsx", ".env.example", ".env.sample"],
    run: async (context) => {
      const facts: ScannerFact[] = [];

      for (const path of context.inventory.files) {
        const category = context.inventory.entries?.find((entry) => entry.path === path)?.category;

        if (category !== "code" && !isSafeEnvExample(path)) {
          continue;
        }

        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        facts.push(
          ...(isSafeEnvExample(path)
            ? envExampleFacts(path, result.text)
            : processEnvFacts(path, result.text))
        );
      }

      return {
        facts: dedupeFacts(facts),
        stats: {
          files_considered: context.inventory.files.length,
          files_read: facts.length > 0 ? undefined : 0,
          facts_emitted: facts.length
        }
      };
    }
  };
}

export function isSecretLikeEnvName(name: string): boolean {
  return /(TOKEN|SECRET|KEY|PASSWORD|DATABASE_URL)/i.test(name);
}

function processEnvFacts(path: string, text: string): readonly ScannerFact[] {
  const matches: { name: string; index: number }[] = [];

  for (const pattern of processEnvPatterns) {
    for (const match of text.matchAll(pattern)) {
      const name = match[1];

      if (!name) {
        continue;
      }

      matches.push({
        name,
        index: match.index
      });
    }
  }

  return matches
    .sort((left, right) => left.index - right.index)
    .map((match) =>
      envFact(match.name, path, "source", findRegexLocation(text, new RegExp(match.name)))
    );
}

function envExampleFacts(path: string, text: string): readonly ScannerFact[] {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/);

      if (!match?.[1]) {
        return undefined;
      }

      return envFact(match[1], path, "env-example", {
        line_start: index + 1,
        line_end: index + 1,
        excerpt: match[1]
      });
    })
    .filter((fact): fact is ScannerFact => fact !== undefined);
}

function envFact(
  name: string,
  path: string,
  source: string,
  location: SourceLocation | undefined
): ScannerFact {
  return createScannerFact({
    kind: "environment.variable_detected",
    value: {
      name,
      source,
      secret: isSecretLikeEnvName(name)
    },
    confidence: "high",
    detector: detectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: path.startsWith(".env.") ? "config" : "source",
        sourcePath: path,
        detector: detectorName,
        location
      })
    ]
  });
}

function dedupeFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  const seen = new Set<string>();

  return facts.filter((fact) => {
    const value = fact.value as { name?: string; source?: string };
    const key = `${value.name ?? fact.id}:${value.source ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isSafeEnvExample(path: string): boolean {
  return path === ".env.example" || path === ".env.sample" || path === ".env.template";
}
