import type { RepositoryDetector } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { createEvidenceFromLocation, type SourceLocation } from "./source-location.js";

const detectorName = "makefile";

const knownTargetCategories: Readonly<Record<string, string>> = {
  install: "setup",
  bootstrap: "setup",
  start: "start",
  stop: "stop",
  dev: "development",
  test: "test",
  lint: "lint",
  typecheck: "typecheck",
  migrate: "migration",
  seed: "seed",
  healthcheck: "healthcheck",
  verify: "verification"
};

export type ScriptTarget = {
  readonly name: string;
  readonly command: string;
  readonly category: string;
  readonly confidence: "high" | "low";
  readonly line: number;
};

export type ScriptFileInfo = {
  readonly path: string;
  readonly kind: "makefile" | "justfile";
  readonly targets: readonly ScriptTarget[];
};

export function parseScriptFile(path: string, text: string): ScriptFileInfo {
  const kind = isJustfilePath(path) ? "justfile" : "makefile";
  const targets = kind === "justfile" ? parseJustfileTargets(text) : parseMakefileTargets(text);

  return {
    path,
    kind,
    targets: [...targets].sort((left, right) => left.name.localeCompare(right.name))
  };
}

export function createMakefileDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["command.detected"],
    filePatterns: ["Makefile", "makefile", "Justfile", "justfile"],
    run: async (context) => {
      const facts: ScannerFact[] = [];

      for (const path of context.inventory.files.filter(isScriptFilePath)) {
        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        facts.push(...commandFacts(parseScriptFile(path, result.text)));
      }

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

function parseMakefileTargets(text: string): readonly ScriptTarget[] {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      if (/^\s*\./.test(line)) {
        return undefined;
      }

      const match = line.match(/^([A-Za-z0-9_.%$-]+(?:\s+[A-Za-z0-9_.%$-]+)*)\s*:(?![=])/);

      if (!match?.[1]) {
        return undefined;
      }

      const names = match[1].split(/\s+/).filter(Boolean);
      const firstKnownName = names.find((name) => knownTargetCategories[name]);

      if (!firstKnownName) {
        return undefined;
      }

      return target(firstKnownName, `make ${firstKnownName}`, index + 1);
    })
    .filter((entry): entry is ScriptTarget => entry !== undefined);
}

function parseJustfileTargets(text: string): readonly ScriptTarget[] {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^([A-Za-z0-9_.%$-]+)(?:\s+.*)?\s*:/);
      const name = match?.[1];

      if (!name || !knownTargetCategories[name]) {
        return undefined;
      }

      return target(name, `just ${name}`, index + 1);
    })
    .filter((entry): entry is ScriptTarget => entry !== undefined);
}

function target(name: string, command: string, line: number): ScriptTarget {
  return {
    name,
    command,
    category: knownTargetCategories[name]!,
    confidence: /[%$]/.test(name) ? "low" : "high",
    line
  };
}

function commandFacts(info: ScriptFileInfo): readonly ScannerFact[] {
  return info.targets.map((target) =>
    createScannerFact({
      kind: "command.detected",
      value: {
        name: target.name,
        command: target.command,
        category: target.category,
        cwd: scriptRoot(info.path),
        source: info.kind
      },
      confidence: target.confidence,
      detector: detectorName,
      evidence: [
        createEvidenceFromLocation({
          kind: "config",
          sourcePath: info.path,
          detector: detectorName,
          location: targetLocation(target)
        })
      ]
    })
  );
}

function targetLocation(target: ScriptTarget): SourceLocation {
  return {
    line_start: target.line,
    line_end: target.line,
    excerpt: target.name
  };
}

function isScriptFilePath(path: string): boolean {
  const name = path.split("/").at(-1) ?? path;

  return name === "Makefile" || name === "makefile" || name === "Justfile" || name === "justfile";
}

function isJustfilePath(path: string): boolean {
  const name = path.split("/").at(-1) ?? path;

  return name === "Justfile" || name === "justfile";
}

function scriptRoot(path: string): string {
  return path.includes("/") ? path.split("/").slice(0, -1).join("/") : ".";
}
