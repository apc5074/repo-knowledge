import { createHash } from "node:crypto";

import type { ScannerConfidence, ScannerEvidence, ScannerEvidenceKind } from "./evidence.js";

export const scannerFactKinds = [
  "language.detected",
  "package_manager.detected",
  "framework.detected",
  "application.detected",
  "service.detected",
  "entrypoint.detected",
  "command.detected",
  "dockerfile.detected",
  "compose.file_detected",
  "compose.service_detected",
  "devcontainer.detected",
  "environment.variable_detected",
  "database.dependency_detected",
  "cache.dependency_detected",
  "migration.directory_detected",
  "seed.directory_detected",
  "api.route_file_detected",
  "worker.detected",
  "generated.path_detected",
  "documentation.detected",
  "agent_instruction.detected",
  "repo_skill.detected",
  "legacy.marker_detected",
  "legacy.path_candidate_detected",
  "legacy.symbol_candidate_detected",
  "legacy.command_candidate_detected",
  "legacy.route_candidate_detected",
  "legacy.replacement_detected",
  "ci.workflow_detected"
] as const;

export type ScannerFactKind = (typeof scannerFactKinds)[number];

export type ScannerFactSource = "deterministic";

export type FutureMaintenanceAgent =
  | "scanner"
  | "contract"
  | "drift"
  | "documentation"
  | "skill"
  | "legacy"
  | "context"
  | "verification";

export type ScannerFact<TValue = unknown> = {
  readonly id: string;
  readonly kind: ScannerFactKind;
  readonly value: TValue;
  readonly confidence: ScannerConfidence;
  readonly source: ScannerFactSource;
  readonly detector: string;
  readonly evidence: readonly ScannerEvidence[];
};

export type CreateScannerFactInput<TValue = unknown> = {
  readonly kind: ScannerFactKind;
  readonly value: TValue;
  readonly confidence: ScannerConfidence;
  readonly detector: string;
  readonly evidence: readonly ScannerEvidence[];
  readonly id?: string;
};

export type ScannerFactDefinition = {
  readonly kind: ScannerFactKind;
  readonly description: string;
  readonly valueShape: string;
  readonly evidenceKinds: readonly ScannerEvidenceKind[];
  readonly confidenceGuidance: string;
  readonly consumedBy: readonly FutureMaintenanceAgent[];
};

export const scannerFactDefinitions: readonly ScannerFactDefinition[] = [
  defineFact(
    "language.detected",
    "Programming language signal detected from tracked source files or canonical manifests.",
    "{ language: string; files?: number; primary?: boolean }",
    ["source", "config"],
    "High for canonical manifests or clear source extensions; medium for mixed weak signals.",
    ["scanner", "contract", "drift", "context", "verification"]
  ),
  defineFact(
    "package_manager.detected",
    "Package manager detected from lockfiles, manifest packageManager fields, or Python project files.",
    "{ name: string; version?: string; primary?: boolean; workspace?: boolean }",
    ["config"],
    "High for lockfiles or manifest packageManager fields; medium for dependency files without lockfiles.",
    ["scanner", "contract", "drift", "context", "verification"]
  ),
  defineFact(
    "framework.detected",
    "Application framework detected from dependencies, config files, imports, or known conventions.",
    "{ name: string; language?: string; version?: string; package?: string }",
    ["config", "source"],
    "High for explicit dependencies plus framework files; medium for dependency-only evidence.",
    ["scanner", "contract", "drift", "documentation", "context", "verification"]
  ),
  defineFact(
    "application.detected",
    "Candidate runnable application boundary detected from manifests, workspaces, scripts, or entrypoints.",
    "{ id?: string; name: string; path: string; kind?: string }",
    ["config", "source"],
    "High for workspace/package boundaries with commands; medium for conventional directories.",
    ["scanner", "contract", "drift", "context", "verification"]
  ),
  defineFact(
    "service.detected",
    "Local service dependency or runtime service detected from Compose, Dev Container, manifests, or config.",
    "{ name: string; kind: string; source?: string; port?: number }",
    ["config"],
    "High for explicit Compose or Dev Container service definitions; medium for dependency-only signals.",
    ["scanner", "contract", "context"]
  ),
  defineFact(
    "entrypoint.detected",
    "Runnable code entrypoint detected from scripts, package bin fields, Python module markers, or conventions.",
    "{ path: string; runtime?: string; command?: string; application?: string }",
    ["source", "config"],
    "High for explicit manifest/bin/script references; medium for common framework conventions.",
    ["scanner", "contract", "context", "verification"]
  ),
  defineFact(
    "command.detected",
    "Development command detected from scripts, Makefiles, Justfiles, Dockerfiles, docs, or CI.",
    "{ name: string; command: string; category?: string; cwd?: string }",
    ["config", "documentation"],
    "High for canonical machine-readable command definitions; medium for documented commands.",
    ["scanner", "contract", "drift", "documentation", "context", "verification"]
  ),
  defineFact(
    "dockerfile.detected",
    "Dockerfile detected with useful build or runtime metadata.",
    "{ path: string; baseImage?: string; stages?: string[] }",
    ["config"],
    "High when parsed from a Dockerfile path and instructions.",
    ["scanner", "contract", "context", "verification"]
  ),
  defineFact(
    "compose.file_detected",
    "Docker Compose file detected.",
    "{ path: string; serviceCount?: number }",
    ["config"],
    "High when parsed from a known Compose file.",
    ["scanner", "contract", "context", "verification"]
  ),
  defineFact(
    "compose.service_detected",
    "Docker Compose service detected.",
    "{ name: string; image?: string; build?: string; ports?: string[] }",
    ["config"],
    "High when parsed from Compose services.",
    ["scanner", "contract", "context", "verification"]
  ),
  defineFact(
    "devcontainer.detected",
    "Dev Container configuration detected.",
    "{ path: string; name?: string; image?: string; composeFile?: string | string[] }",
    ["config"],
    "High when parsed from .devcontainer configuration.",
    ["scanner", "contract", "context", "verification"]
  ),
  defineFact(
    "environment.variable_detected",
    "Environment variable name detected without emitting secret values.",
    "{ name: string; required?: boolean; source?: string }",
    ["source", "config", "documentation"],
    "High for schema/config declarations; medium for direct source reads; low for prose references.",
    ["scanner", "contract", "drift", "documentation", "context", "verification"]
  ),
  defineFact(
    "database.dependency_detected",
    "Database dependency detected from manifests, imports, service config, or env names.",
    "{ name: string; kind?: string; package?: string; service?: string }",
    ["config", "source"],
    "High for explicit dependency/service declarations; medium for import or env-name signals.",
    ["scanner", "contract", "context"]
  ),
  defineFact(
    "cache.dependency_detected",
    "Cache or Redis-like dependency detected from manifests, imports, service config, or env names.",
    "{ name: string; package?: string; service?: string }",
    ["config", "source"],
    "High for explicit dependency/service declarations; medium for import or env-name signals.",
    ["scanner", "contract", "context"]
  ),
  defineFact(
    "migration.directory_detected",
    "Migration directory detected.",
    "{ path: string; tool?: string }",
    ["source", "config"],
    "High for known migration directory conventions or ORM config references.",
    ["scanner", "contract", "context", "verification"]
  ),
  defineFact(
    "seed.directory_detected",
    "Seed data or seed script directory detected.",
    "{ path: string; tool?: string }",
    ["source", "config"],
    "High for known seed directory conventions or explicit script references.",
    ["scanner", "contract", "context", "verification"]
  ),
  defineFact(
    "api.route_file_detected",
    "API route file detected from framework conventions, decorators, or route registrations.",
    "{ path: string; framework?: string; route?: string }",
    ["source"],
    "High for known route file conventions or parsed route decorators; medium for naming conventions.",
    ["scanner", "contract", "documentation", "context", "verification"]
  ),
  defineFact(
    "worker.detected",
    "Background worker or queue processor detected.",
    "{ path?: string; command?: string; framework?: string; queue?: string }",
    ["source", "config"],
    "High for explicit worker commands or framework-specific declarations; medium for naming conventions.",
    ["scanner", "contract", "context", "verification"]
  ),
  defineFact(
    "generated.path_detected",
    "Generated or managed path detected that agents should avoid editing directly.",
    "{ path: string; generator?: string; regenerationCommand?: string }",
    ["source", "config"],
    "High for generated headers, lockfiles, or known generated directories.",
    ["scanner", "documentation", "skill", "context", "verification"]
  ),
  defineFact(
    "documentation.detected",
    "Tracked documentation file detected without summarizing or rewriting it.",
    "{ path: string; title?: string; docType?: string }",
    ["documentation"],
    "High for README/docs/runbook/changelog paths.",
    ["scanner", "documentation", "skill", "context"]
  ),
  defineFact(
    "agent_instruction.detected",
    "Agent instruction file detected.",
    "{ path: string; tool?: string; scope?: string }",
    ["documentation", "config"],
    "High for known agent instruction filenames and directories.",
    ["scanner", "documentation", "skill", "context"]
  ),
  defineFact(
    "repo_skill.detected",
    "Repo-local skill or reusable agent guidance detected without judging quality.",
    "{ name?: string; path: string; referencedPaths?: string[] }",
    ["documentation", "config"],
    "High for known skill manifests or skill files; medium for conventional guidance files.",
    ["scanner", "documentation", "skill", "context"]
  ),
  defineFact(
    "legacy.marker_detected",
    "Explicit legacy, deprecated, replaced, or do-not-use marker detected.",
    "{ target: string; marker: string; replacement?: string }",
    ["source", "documentation"],
    "High for explicit markers; confidence should not imply safe deletion.",
    ["scanner", "legacy", "documentation", "context"]
  ),
  defineFact(
    "legacy.path_candidate_detected",
    "Path that may be legacy, deprecated, replaced, or unused.",
    "{ path: string; signal: string; caveat?: string; replacement?: string }",
    ["source", "documentation", "config"],
    "Medium or low unless backed by explicit deprecation markers.",
    ["scanner", "legacy", "context"]
  ),
  defineFact(
    "legacy.symbol_candidate_detected",
    "Symbol that may be legacy, deprecated, replaced, or unused.",
    "{ symbol: string; path: string; signal: string; caveat?: string; replacement?: string }",
    ["source"],
    "Medium or low; absence of usage evidence alone is not high confidence.",
    ["scanner", "legacy", "context"]
  ),
  defineFact(
    "legacy.command_candidate_detected",
    "Command that may be stale, duplicated, deprecated, or replaced.",
    "{ command: string; signal: string; caveat?: string; replacement?: string }",
    ["config", "documentation"],
    "Medium or low unless explicitly marked deprecated.",
    ["scanner", "legacy", "documentation", "verification"]
  ),
  defineFact(
    "legacy.route_candidate_detected",
    "Route file or route reference that may be stale, deprecated, or replaced.",
    "{ path?: string; route?: string; signal: string; caveat?: string; replacement?: string }",
    ["source", "documentation"],
    "Medium or low; should remain reviewable candidate guidance.",
    ["scanner", "legacy", "documentation", "context"]
  ),
  defineFact(
    "legacy.replacement_detected",
    "Replacement hint detected for a legacy/deprecated path, symbol, command, or route.",
    "{ target: string; replacement: string; source?: string }",
    ["source", "documentation", "config"],
    "High for explicit replaced-by statements; medium for migration docs.",
    ["scanner", "legacy", "documentation", "context"]
  ),
  defineFact(
    "ci.workflow_detected",
    "CI workflow detected from GitHub Actions configuration.",
    "{ path: string; name?: string; triggers?: string[]; jobs?: string[] }",
    ["config"],
    "High when parsed from .github/workflows YAML.",
    ["scanner", "contract", "context", "verification"]
  )
];

export function createScannerFact<TValue>(
  input: CreateScannerFactInput<TValue>
): ScannerFact<TValue> {
  if (input.detector.trim().length === 0) {
    throw new Error("Scanner fact detector is required.");
  }

  if (input.evidence.length === 0) {
    throw new Error("Scanner facts require at least one evidence record.");
  }

  return {
    id: input.id ?? createScannerFactId(input),
    kind: input.kind,
    value: input.value,
    confidence: input.confidence,
    source: "deterministic",
    detector: input.detector,
    evidence: input.evidence
  };
}

export function isScannerFactKind(value: string): value is ScannerFactKind {
  return scannerFactKinds.includes(value as ScannerFactKind);
}

export function getScannerFactDefinition(kind: ScannerFactKind): ScannerFactDefinition {
  const definition = scannerFactDefinitions.find((candidate) => candidate.kind === kind);

  if (definition === undefined) {
    throw new Error(`Missing scanner fact definition for ${kind}.`);
  }

  return definition;
}

function defineFact(
  kind: ScannerFactKind,
  description: string,
  valueShape: string,
  evidenceKinds: readonly ScannerEvidenceKind[],
  confidenceGuidance: string,
  consumedBy: readonly FutureMaintenanceAgent[]
): ScannerFactDefinition {
  return {
    kind,
    description,
    valueShape,
    evidenceKinds,
    confidenceGuidance,
    consumedBy
  };
}

function createScannerFactId(input: CreateScannerFactInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        kind: input.kind,
        value: input.value,
        detector: input.detector,
        evidence: input.evidence.map((evidence) => ({
          path: evidence.source_path,
          line_start: evidence.line_start,
          line_end: evidence.line_end
        }))
      })
    )
    .digest("hex")
    .slice(0, 24);
}
