import type { RepositoryDetector } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { createEvidenceFromLocation, findStringLocation } from "./source-location.js";

const detectorName = "migration-seed";

const migrationDirectoryPatterns = [
  /(^|\/)migrations\//,
  /^db\/migrations\//,
  /^prisma\/migrations\//,
  /^alembic\//,
  /^sequelize\//,
  /^src\/db\/migrations\//
] as const;

const seedDirectoryPatterns = [
  /(^|\/)seeds\//,
  /(^|\/)seed\//,
  /^db\/seeds\//,
  /^scripts\/seed\//
] as const;

export type DataDirectoryCandidate = {
  readonly path: string;
  readonly kind: "migration" | "seed";
  readonly tool?: string;
  readonly evidencePath: string;
};

export function detectDataDirectories(files: readonly string[]): readonly DataDirectoryCandidate[] {
  const candidates = new Map<string, DataDirectoryCandidate>();

  for (const file of files) {
    if (isGeneratedPath(file)) {
      continue;
    }

    const migrationRoot = matchingRoot(file, migrationDirectoryPatterns);
    const seedRoot = matchingRoot(file, seedDirectoryPatterns);

    if (migrationRoot) {
      candidates.set(`migration:${migrationRoot}`, {
        path: migrationRoot,
        kind: "migration",
        tool: toolForPath(migrationRoot),
        evidencePath: file
      });
    }

    if (seedRoot) {
      candidates.set(`seed:${seedRoot}`, {
        path: seedRoot,
        kind: "seed",
        tool: toolForPath(seedRoot),
        evidencePath: file
      });
    }
  }

  return [...candidates.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function createMigrationSeedDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["migration.directory_detected", "seed.directory_detected"],
    run: async (context) => {
      const candidates = detectDataDirectories(context.inventory.files);
      const facts: ScannerFact[] = [];

      for (const candidate of candidates) {
        const result = await context.readFileIfSafe(candidate.evidencePath);
        const text = result.ok ? result.text : "";

        facts.push(directoryFact(candidate, text));
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

function directoryFact(candidate: DataDirectoryCandidate, text: string): ScannerFact {
  return createScannerFact({
    kind:
      candidate.kind === "migration" ? "migration.directory_detected" : "seed.directory_detected",
    value: {
      path: candidate.path,
      tool: candidate.tool
    },
    confidence: confidenceForCandidate(candidate),
    detector: detectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: "source",
        sourcePath: candidate.evidencePath,
        detector: detectorName,
        location: findStringLocation(text, candidate.path.split("/").at(-1) ?? candidate.path) ?? {
          line_start: 1,
          line_end: 1,
          excerpt: candidate.evidencePath
        }
      })
    ]
  });
}

function matchingRoot(path: string, patterns: readonly RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = path.match(pattern);

    if (!match || match.index === undefined) {
      continue;
    }

    const prefix = path.slice(0, match.index + match[0].length).replace(/\/$/, "");
    return prefix.length > 0 ? prefix : match[0].replace(/\/$/, "");
  }

  return undefined;
}

function toolForPath(path: string): string | undefined {
  if (path.startsWith("prisma/")) {
    return "prisma";
  }

  if (path.startsWith("alembic")) {
    return "alembic";
  }

  if (path.startsWith("sequelize")) {
    return "sequelize";
  }

  return undefined;
}

function confidenceForCandidate(candidate: DataDirectoryCandidate): "high" | "medium" {
  if (candidate.tool || candidate.path.startsWith("db/") || candidate.path.startsWith("src/db/")) {
    return "high";
  }

  return "medium";
}

function isGeneratedPath(path: string): boolean {
  return /(^|\/)(__generated__|generated)\//.test(path) || /\.generated\./.test(path);
}
