import type { RepositoryDetector, ScanContext } from "./detector.js";
import {
  createEvidenceFromLocation,
  findConfigKeyLocation,
  findStringLocation,
  type SourceLocation
} from "./source-location.js";
import { createScannerFact, type ScannerFact } from "./facts.js";

const detectorName = "package-manager";

type PackageManagerName = "npm" | "pnpm" | "yarn" | "poetry" | "uv" | "pip" | "pip-tools";

type PackageManagerSignal = {
  readonly name: PackageManagerName;
  readonly version?: string;
  readonly primary?: boolean;
  readonly confidence: "high" | "medium";
  readonly path: string;
  readonly location?: SourceLocation;
};

export function createPackageManagerDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["package_manager.detected"],
    filePatterns: [
      "package.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "pyproject.toml",
      "poetry.lock",
      "uv.lock",
      "requirements.txt",
      "requirements.in"
    ],
    run: async (context) => {
      const signals = await collectPackageManagerSignals(context);
      const facts = signals.map((signal) => packageManagerFact(signal));

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

async function collectPackageManagerSignals(
  context: ScanContext
): Promise<readonly PackageManagerSignal[]> {
  const signals = new Map<PackageManagerName, PackageManagerSignal>();
  const packageJsonPaths = context.inventory.files.filter((path) => path.endsWith("package.json"));

  for (const packageJsonPath of packageJsonPaths) {
    const result = await context.readFileIfSafe(packageJsonPath);

    if (!result.ok) {
      continue;
    }

    const packageManager = readPackageManagerField(result.text);

    if (packageManager && isJavaScriptPackageManager(packageManager.name)) {
      signals.set(packageManager.name, {
        ...packageManager,
        primary: true,
        confidence: "high",
        path: packageJsonPath,
        location: findConfigKeyLocation(result.text, "packageManager")
      });
    }
  }

  addSignal(signals, context, "npm", "package-lock.json", "high");
  addSignal(signals, context, "pnpm", "pnpm-lock.yaml", "high");
  addSignal(signals, context, "yarn", "yarn.lock", "high");
  addSignal(signals, context, "poetry", "poetry.lock", "high", true);
  addSignal(signals, context, "uv", "uv.lock", "high", true);
  addSignal(signals, context, "pip", "requirements.txt", "medium");
  addSignal(signals, context, "pip-tools", "requirements.in", "medium");

  for (const pyprojectPath of context.inventory.files.filter((path) =>
    path.endsWith("pyproject.toml")
  )) {
    const result = await context.readFileIfSafe(pyprojectPath);

    if (!result.ok) {
      continue;
    }

    if (result.text.includes("[tool.poetry]")) {
      addOrKeepPrimary(signals, {
        name: "poetry",
        primary: !signals.has("uv"),
        confidence: "high",
        path: pyprojectPath,
        location: findStringLocation(result.text, "[tool.poetry]")
      });
    }

    if (result.text.includes("[tool.uv]") || result.text.includes("[dependency-groups]")) {
      addOrKeepPrimary(signals, {
        name: "uv",
        primary: true,
        confidence: "high",
        path: pyprojectPath,
        location: findStringLocation(
          result.text,
          result.text.includes("[tool.uv]") ? "[tool.uv]" : "[dependency-groups]"
        )
      });
    }
  }

  return [...signals.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function addSignal(
  signals: Map<PackageManagerName, PackageManagerSignal>,
  context: ScanContext,
  name: PackageManagerName,
  fileName: string,
  confidence: "high" | "medium",
  primary = false
): void {
  const path = context.inventory.files.find((candidate) => candidate.endsWith(fileName));

  if (!path) {
    return;
  }

  addOrKeepPrimary(signals, {
    name,
    primary,
    confidence,
    path
  });
}

function addOrKeepPrimary(
  signals: Map<PackageManagerName, PackageManagerSignal>,
  signal: PackageManagerSignal
): void {
  const existing = signals.get(signal.name);

  if (!existing) {
    signals.set(signal.name, signal);
    return;
  }

  signals.set(signal.name, {
    ...existing,
    primary: existing.primary || signal.primary,
    version: existing.version ?? signal.version,
    confidence: existing.confidence === "high" ? "high" : signal.confidence,
    path: existing.primary ? existing.path : signal.path,
    location: existing.location ?? signal.location
  });
}

function packageManagerFact(signal: PackageManagerSignal): ScannerFact {
  return createScannerFact({
    kind: "package_manager.detected",
    value: {
      name: signal.name,
      version: signal.version,
      primary: signal.primary
    },
    confidence: signal.confidence,
    detector: detectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: "config",
        sourcePath: signal.path,
        detector: detectorName,
        location: signal.location ?? { line_start: 1, line_end: 1 }
      })
    ]
  });
}

function readPackageManagerField(
  text: string
): { name: PackageManagerName; version?: string } | undefined {
  let parsed: { packageManager?: unknown };

  try {
    parsed = JSON.parse(text) as { packageManager?: unknown };
  } catch {
    return undefined;
  }

  if (typeof parsed.packageManager !== "string") {
    return undefined;
  }

  const [name, version] = parsed.packageManager.split("@");

  if (!isPackageManagerName(name)) {
    return undefined;
  }

  return {
    name,
    version: version && version.length > 0 ? version : undefined
  };
}

function isJavaScriptPackageManager(name: PackageManagerName): name is "npm" | "pnpm" | "yarn" {
  return name === "npm" || name === "pnpm" || name === "yarn";
}

function isPackageManagerName(value: string | undefined): value is PackageManagerName {
  return (
    value === "npm" ||
    value === "pnpm" ||
    value === "yarn" ||
    value === "poetry" ||
    value === "uv" ||
    value === "pip" ||
    value === "pip-tools"
  );
}
