import type { RepositoryDetector } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { isSecretLikeEnvName } from "./javascript-env-detector.js";
import { createEvidenceFromLocation, type SourceLocation } from "./source-location.js";

const detectorName = "env-file";

export type EnvFileVariable = {
  readonly name: string;
  readonly secret: boolean;
  readonly required: boolean;
  readonly line: number;
};

export type EnvFileInfo = {
  readonly path: string;
  readonly variables: readonly EnvFileVariable[];
};

const safeEnvExampleNames = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  "env.example"
]);

export function parseEnvExampleFile(path: string, text: string): EnvFileInfo {
  return {
    path,
    variables: text
      .split(/\r?\n/)
      .map((line, index) => parseEnvLine(line, index + 1))
      .filter((variable): variable is EnvFileVariable => variable !== undefined)
  };
}

export function createEnvFileDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["environment.variable_detected"],
    filePatterns: [".env.example", ".env.sample", ".env.template", "env.example"],
    run: async (context) => {
      const facts: ScannerFact[] = [];

      for (const path of context.inventory.files.filter(isSafeEnvExamplePath)) {
        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        facts.push(...envFacts(parseEnvExampleFile(path, result.text)));
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

function parseEnvLine(line: string, lineNumber: number): EnvFileVariable | undefined {
  const trimmed = line.trim();

  if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("export #")) {
    return undefined;
  }

  const match = trimmed.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*(?:=|$)/);
  const name = match?.[1];

  if (!name) {
    return undefined;
  }

  return {
    name,
    secret: isSecretLikeEnvName(name),
    required: !/^\s*#/.test(line),
    line: lineNumber
  };
}

function envFacts(info: EnvFileInfo): readonly ScannerFact[] {
  return info.variables.map((variable) =>
    createScannerFact({
      kind: "environment.variable_detected",
      value: {
        name: variable.name,
        source: "env-example",
        secret: variable.secret,
        required: variable.required
      },
      confidence: "high",
      detector: detectorName,
      evidence: [
        createEvidenceFromLocation({
          kind: "config",
          sourcePath: info.path,
          detector: detectorName,
          location: variableLocation(variable)
        })
      ]
    })
  );
}

function variableLocation(variable: EnvFileVariable): SourceLocation {
  return {
    line_start: variable.line,
    line_end: variable.line,
    excerpt: variable.name
  };
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

function isSafeEnvExamplePath(path: string): boolean {
  return safeEnvExampleNames.has(path.split("/").at(-1) ?? path);
}
