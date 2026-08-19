import type { RepositoryDetector, ScanWarning } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import {
  createEvidenceFromLocation,
  findConfigKeyLocation,
  type SourceLocation
} from "./source-location.js";

const detectorName = "javascript-manifest";

export type JavaScriptPackageManifest = {
  readonly path: string;
  readonly name?: string;
  readonly main?: string;
  readonly bin: readonly string[];
  readonly exports: readonly string[];
  readonly scripts: Readonly<Record<string, string>>;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly packageManager?: string;
  readonly workspaces: readonly string[];
  readonly moduleType?: string;
};

export type ParseJavaScriptManifestResult =
  | {
      readonly ok: true;
      readonly manifest: JavaScriptPackageManifest;
    }
  | {
      readonly ok: false;
      readonly warning: ScanWarning;
    };

export function parseJavaScriptPackageManifest(
  path: string,
  text: string
): ParseJavaScriptManifestResult {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    return {
      ok: false,
      warning: {
        detector: detectorName,
        path,
        message: `Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`
      }
    };
  }

  return {
    ok: true,
    manifest: {
      path,
      name: stringField(parsed.name),
      main: stringField(parsed.main),
      bin: binField(parsed.bin),
      exports: exportsField(parsed.exports),
      scripts: stringRecordField(parsed.scripts),
      dependencies: stringRecordField(parsed.dependencies),
      devDependencies: stringRecordField(parsed.devDependencies),
      packageManager: stringField(parsed.packageManager),
      workspaces: workspaceField(parsed.workspaces),
      moduleType: stringField(parsed.type)
    }
  };
}

export function parseTypeScriptConfig(path: string, text: string): ParseTypeScriptConfigResult {
  try {
    JSON.parse(text);

    return {
      ok: true,
      path
    };
  } catch (error) {
    return {
      ok: false,
      warning: {
        detector: detectorName,
        path,
        message: `Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`
      }
    };
  }
}

export type ParseTypeScriptConfigResult =
  | {
      readonly ok: true;
      readonly path: string;
    }
  | {
      readonly ok: false;
      readonly warning: ScanWarning;
    };

export function createJavaScriptManifestDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["application.detected", "command.detected", "language.detected"],
    filePatterns: ["package.json", "tsconfig.json"],
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
          warnings.push(parsed.warning);
          continue;
        }

        facts.push(...manifestFacts(parsed.manifest, result.text));
      }

      for (const path of context.inventory.files.filter((candidate) =>
        candidate.endsWith("tsconfig.json")
      )) {
        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        const parsed = parseTypeScriptConfig(path, result.text);

        if (!parsed.ok) {
          warnings.push(parsed.warning);
        }
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

function manifestFacts(manifest: JavaScriptPackageManifest, text: string): readonly ScannerFact[] {
  const facts: ScannerFact[] = [
    createScannerFact({
      kind: "application.detected",
      value: {
        name: manifest.name ?? manifest.path.replace(/\/package\.json$/, ""),
        path: packageRoot(manifest.path),
        kind: "node-package",
        packageManager: manifest.packageManager,
        moduleType: manifest.moduleType,
        workspaces: manifest.workspaces
      },
      confidence: "high",
      detector: detectorName,
      evidence: [
        createEvidenceFromLocation({
          kind: "config",
          sourcePath: manifest.path,
          detector: detectorName,
          location: findConfigKeyLocation(text, "name") ?? firstLine()
        })
      ]
    })
  ];

  for (const [name, command] of Object.entries(manifest.scripts).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    facts.push(
      createScannerFact({
        kind: "command.detected",
        value: {
          name,
          command,
          category: classifyScript(name),
          cwd: packageRoot(manifest.path)
        },
        confidence: "high",
        detector: detectorName,
        evidence: [
          createEvidenceFromLocation({
            kind: "config",
            sourcePath: manifest.path,
            detector: detectorName,
            location:
              findConfigKeyLocation(text, name) ??
              findConfigKeyLocation(text, "scripts") ??
              firstLine()
          })
        ]
      })
    );
  }

  return facts;
}

function packageRoot(path: string): string {
  return path.endsWith("/package.json") ? path.slice(0, -"/package.json".length) : ".";
}

function firstLine(): SourceLocation {
  return {
    line_start: 1,
    line_end: 1
  };
}

function classifyScript(name: string): string {
  if (name.includes("test")) {
    return "test";
  }

  if (name === "dev" || name === "start") {
    return "run";
  }

  if (name === "build") {
    return "build";
  }

  if (name === "lint" || name === "typecheck" || name === "format") {
    return "quality";
  }

  if (name.includes("migrate")) {
    return "migration";
  }

  if (name.includes("seed")) {
    return "seed";
  }

  return "other";
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringRecordField(value: unknown): Readonly<Record<string, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => {
      const [, fieldValue] = entry;

      return typeof fieldValue === "string";
    })
  );
}

function workspaceField(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { packages?: unknown }).packages)
  ) {
    return (value as { packages: unknown[] }).packages.filter(
      (entry): entry is string => typeof entry === "string"
    );
  }

  return [];
}

function binField(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.values(value as Record<string, unknown>).filter(
    (entry): entry is string => typeof entry === "string"
  );
}

function exportsField(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.values(value as Record<string, unknown>)
    .flatMap((entry) => {
      if (typeof entry === "string") {
        return [entry];
      }

      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        return Object.values(entry as Record<string, unknown>).filter(
          (nested): nested is string => typeof nested === "string"
        );
      }

      return [];
    })
    .sort();
}
