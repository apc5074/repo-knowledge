import { extname } from "node:path";

import type { RepositoryDetector, ScanContext } from "./detector.js";
import { createEvidenceFromLocation } from "./source-location.js";
import { createScannerFact, type ScannerFact } from "./facts.js";

const detectorName = "language";

type LanguageName = "typescript" | "javascript" | "python" | "go";

type LanguageSignal = {
  readonly language: LanguageName;
  readonly path: string;
  readonly strength: "manifest" | "source";
};

const languageExtensions: Record<string, LanguageName> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go"
};

export function createLanguageDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["language.detected"],
    run: (context) => {
      const facts = collectLanguageSignals(context).map((signal) => languageFact(signal));

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

function collectLanguageSignals(context: ScanContext): readonly AggregatedLanguageSignal[] {
  const signals = new Map<LanguageName, LanguageSignal[]>();

  for (const path of context.inventory.files) {
    addManifestSignal(signals, path);

    const language = languageExtensions[extname(path).toLowerCase()];

    if (language && isSourcePath(context, path)) {
      addSignal(signals, {
        language,
        path,
        strength: "source"
      });
    }
  }

  const aggregated: AggregatedLanguageSignal[] = [...signals.entries()].map(
    ([language, languageSignals]) => ({
      language,
      signals: languageSignals,
      sourceFileCount: languageSignals.filter((signal) => signal.strength === "source").length,
      confidence: languageSignals.some((signal) => signal.strength === "manifest")
        ? "high"
        : "medium"
    })
  );
  const bestScore = Math.max(0, ...aggregated.map(languageScore));

  return aggregated
    .map((signal) => ({
      ...signal,
      primary: languageScore(signal) === bestScore && bestScore > 0
    }))
    .sort((left, right) => left.language.localeCompare(right.language));
}

type AggregatedLanguageSignal = {
  readonly language: LanguageName;
  readonly signals: readonly LanguageSignal[];
  readonly sourceFileCount: number;
  readonly confidence: "high" | "medium";
  readonly primary?: boolean;
};

function addManifestSignal(signals: Map<LanguageName, LanguageSignal[]>, path: string): void {
  if (path.endsWith("tsconfig.json")) {
    addSignal(signals, {
      language: "typescript",
      path,
      strength: "manifest"
    });
  }

  if (path.endsWith("package.json")) {
    addSignal(signals, {
      language: "javascript",
      path,
      strength: "manifest"
    });
  }

  if (path.endsWith("pyproject.toml") || path.endsWith("requirements.txt")) {
    addSignal(signals, {
      language: "python",
      path,
      strength: "manifest"
    });
  }

  if (path.endsWith("go.mod")) {
    addSignal(signals, {
      language: "go",
      path,
      strength: "manifest"
    });
  }
}

function addSignal(signals: Map<LanguageName, LanguageSignal[]>, signal: LanguageSignal): void {
  signals.set(signal.language, [...(signals.get(signal.language) ?? []), signal]);
}

function isSourcePath(context: ScanContext, path: string): boolean {
  return context.inventory.entries?.find((entry) => entry.path === path)?.category === "code";
}

function languageFact(signal: AggregatedLanguageSignal): ScannerFact {
  const evidenceSignal =
    signal.signals.find((candidate) => candidate.strength === "manifest") ?? signal.signals[0];

  return createScannerFact({
    kind: "language.detected",
    value: {
      language: signal.language,
      files: signal.sourceFileCount,
      primary: signal.primary
    },
    confidence: signal.confidence,
    detector: detectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: evidenceSignal.strength === "manifest" ? "config" : "source",
        sourcePath: evidenceSignal.path,
        detector: detectorName,
        location: {
          line_start: 1,
          line_end: 1
        }
      })
    ]
  });
}

function languageScore(signal: AggregatedLanguageSignal): number {
  const manifestBoost = signal.confidence === "high" ? 100 : 0;

  return manifestBoost + signal.sourceFileCount;
}
