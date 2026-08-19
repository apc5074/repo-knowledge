import type { RepositoryDetector } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { parseJavaScriptPackageManifest } from "./javascript-manifest.js";
import {
  createEvidenceFromLocation,
  findConfigKeyLocation,
  findRegexLocation,
  findStringLocation,
  type SourceLocation
} from "./source-location.js";

const detectorName = "legacy";

const markerPattern = /\b(deprecated|legacy|replaced by|do not use)\b[:\s-]*([A-Za-z0-9_./:-]+)?/i;
const pathMarkerPattern = /(^|\/)(legacy|deprecated|old|v1)(\/|$)/i;

export function createLegacyDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: [
      "legacy.marker_detected",
      "legacy.path_candidate_detected",
      "legacy.symbol_candidate_detected",
      "legacy.command_candidate_detected",
      "legacy.route_candidate_detected",
      "legacy.replacement_detected"
    ],
    run: async (context) => {
      const facts: ScannerFact[] = [];
      const files = context.inventory.files;
      const fileSet = new Set(files);

      for (const path of files) {
        const result = await context.readFileIfSafe(path);
        const text = result.ok ? result.text : "";

        facts.push(...markerFacts(path, text));
        facts.push(...legacyPathFacts(path, text));

        if (path.endsWith("package.json")) {
          facts.push(...staleCommandFacts(path, text, fileSet));
        }

        if (isCodePath(path)) {
          facts.push(...unusedExportFacts(path, text, files));
          facts.push(...routeCandidateFacts(path, text, files));
        }

        if (isDocumentationPath(path) || isAgentInstructionPath(path)) {
          facts.push(...missingReferenceFacts(path, text, fileSet));
        }
      }

      return {
        facts: dedupeFacts(facts),
        stats: {
          files_considered: files.length,
          facts_emitted: facts.length
        }
      };
    }
  };
}

function markerFacts(path: string, text: string): readonly ScannerFact[] {
  const facts: ScannerFact[] = [];

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const match = line.match(markerPattern);

    if (!match?.[1]) {
      continue;
    }

    const replacement = replacementFromLine(line);
    const location = {
      line_start: index + 1,
      line_end: index + 1,
      excerpt: line.trim()
    };

    facts.push(
      createScannerFact({
        kind: "legacy.marker_detected",
        value: {
          target: path,
          marker: match[1].toLowerCase(),
          replacement,
          reviewed: false,
          caveat: "Candidate only; not a safe-to-delete instruction."
        },
        confidence: "high",
        detector: detectorName,
        evidence: [evidence(path, text, location)]
      })
    );

    if (replacement) {
      facts.push(
        createScannerFact({
          kind: "legacy.replacement_detected",
          value: {
            target: path,
            replacement,
            source: path
          },
          confidence: "high",
          detector: detectorName,
          evidence: [evidence(path, text, location)]
        })
      );
    }
  }

  return facts;
}

function legacyPathFacts(path: string, text: string): readonly ScannerFact[] {
  if (!pathMarkerPattern.test(path)) {
    return [];
  }

  const explicit = markerPattern.test(text);

  return [
    createScannerFact({
      kind: "legacy.path_candidate_detected",
      value: {
        path,
        signal: explicit ? "legacy path with explicit marker" : "legacy-like path name",
        caveat: explicit
          ? "Candidate only; explicit marker still requires human review."
          : "Path naming can be intentional versioning or compatibility support.",
        reviewed: false
      },
      confidence: explicit ? "medium" : "low",
      detector: detectorName,
      evidence: [
        evidence(
          path,
          text,
          findRegexLocation(text, markerPattern) ?? {
            line_start: 1,
            line_end: 1,
            excerpt: path
          }
        )
      ]
    })
  ];
}

function staleCommandFacts(
  path: string,
  text: string,
  fileSet: ReadonlySet<string>
): readonly ScannerFact[] {
  const parsed = parseJavaScriptPackageManifest(path, text);

  if (!parsed.ok) {
    return [];
  }

  return Object.entries(parsed.manifest.scripts)
    .filter(([name]) => /(old|legacy|deprecated|v1)/i.test(name))
    .map(([name, command]) => {
      const missingTargets = missingScriptTargets(command, fileSet);

      return createScannerFact({
        kind: "legacy.command_candidate_detected",
        value: {
          command,
          signal: `script name "${name}" looks legacy`,
          caveat: missingTargets.length
            ? "One or more referenced paths are not present in tracked files."
            : "Naming can be intentional compatibility support.",
          reviewed: false
        },
        confidence: missingTargets.length ? "medium" : "low",
        detector: detectorName,
        evidence: [evidence(path, text, findConfigKeyLocation(text, name))]
      });
    });
}

function unusedExportFacts(
  path: string,
  text: string,
  files: readonly string[]
): readonly ScannerFact[] {
  if (!/\.[jt]sx?$/.test(path)) {
    return [];
  }

  const exported = [
    ...text.matchAll(/^export\s+(?:function|const|class|type|interface)\s+([A-Za-z0-9_]+)/gm)
  ]
    .map((match) => match[1])
    .filter((symbol): symbol is string => symbol !== undefined);

  return exported
    .filter((symbol) => !hasRepositoryPathReference(symbol, path, files))
    .map((symbol) =>
      createScannerFact({
        kind: "legacy.symbol_candidate_detected",
        value: {
          symbol,
          path,
          signal: "exported symbol has no obvious repository-local path reference",
          caveat:
            "Best-effort path search only; package exports and public APIs can be false positives.",
          reviewed: false
        },
        confidence: "low",
        detector: detectorName,
        evidence: [evidence(path, text, findStringLocation(text, symbol))]
      })
    );
}

function routeCandidateFacts(
  path: string,
  text: string,
  files: readonly string[]
): readonly ScannerFact[] {
  if (!/(routes?|pages\/api|app\/api)/i.test(path) || !markerPattern.test(text)) {
    return [];
  }

  const registered = files.some(
    (file) => file !== path && file.includes(path.split("/").at(-1) ?? path)
  );

  if (registered) {
    return [];
  }

  return [
    createScannerFact({
      kind: "legacy.route_candidate_detected",
      value: {
        path,
        signal: "route file includes explicit legacy/deprecation marker",
        caveat: "Route reachability is not proven in this phase.",
        replacement: replacementFromLine(text),
        reviewed: false
      },
      confidence: "medium",
      detector: detectorName,
      evidence: [evidence(path, text, findRegexLocation(text, markerPattern))]
    })
  ];
}

function missingReferenceFacts(
  path: string,
  text: string,
  fileSet: ReadonlySet<string>
): readonly ScannerFact[] {
  return [...text.matchAll(/`([^`\n]+\.(?:ts|tsx|js|jsx|py|md|json|ya?ml|toml))`/g)]
    .map((match) => match[1])
    .filter((reference): reference is string => reference !== undefined)
    .map((reference) => reference.replace(/^\.\//, ""))
    .filter((reference) => !fileSet.has(reference))
    .map((reference) =>
      createScannerFact({
        kind: "legacy.path_candidate_detected",
        value: {
          path: reference,
          signal: "documentation or agent instruction references missing tracked path",
          caveat: "Reference may be generated, ignored, external, or intentionally created later.",
          source: path,
          reviewed: false
        },
        confidence: "low",
        detector: detectorName,
        evidence: [evidence(path, text, findStringLocation(text, reference))]
      })
    );
}

function replacementFromLine(line: string): string | undefined {
  return line.match(/\breplaced by\s+([A-Za-z0-9_./:-]+)/i)?.[1];
}

function missingScriptTargets(command: string, fileSet: ReadonlySet<string>): readonly string[] {
  return [...command.matchAll(/\b([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|py|sh))\b/g)]
    .map((match) => match[1])
    .filter((path): path is string => path !== undefined)
    .filter((path) => !fileSet.has(path.replace(/^\.\//, "")));
}

function hasRepositoryPathReference(
  symbol: string,
  sourcePath: string,
  files: readonly string[]
): boolean {
  return files.some((path) => path !== sourcePath && isCodePath(path) && path.includes(symbol));
}

function evidence(path: string, _text: string, location?: SourceLocation) {
  return createEvidenceFromLocation({
    kind: isDocumentationPath(path) ? "documentation" : isCodePath(path) ? "source" : "config",
    sourcePath: path,
    detector: detectorName,
    location: location ?? { line_start: 1, line_end: 1 }
  });
}

function isCodePath(path: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(path) || path.endsWith(".py");
}

function isDocumentationPath(path: string): boolean {
  return path.endsWith(".md") || path.endsWith(".mdx") || path.startsWith("docs/");
}

function isAgentInstructionPath(path: string): boolean {
  return (
    path.endsWith("AGENTS.md") ||
    path.endsWith("CLAUDE.md") ||
    path === ".github/copilot-instructions.md" ||
    path === ".cursorrules"
  );
}

function dedupeFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  const seen = new Set<string>();

  return facts.filter((fact) => {
    const value = fact.value as {
      target?: string;
      path?: string;
      symbol?: string;
      command?: string;
    };
    const key = `${fact.kind}:${value.target ?? value.path ?? value.symbol ?? value.command ?? fact.id}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
