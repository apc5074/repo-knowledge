# @repo-knowledge/scanner

Public package for deterministic repository analysis.

This package is the stable import path for scanner consumers. It delegates execution to `@repo-knowledge/scanner-core`, runs the default detector set when callers do not pass explicit detectors, and re-exports the scanner fact and evidence vocabulary.

Use `@repo-knowledge/scanner-core` directly only when building or testing detector internals.

```ts
import { scanRepository } from "@repo-knowledge/scanner";

const result = await scanRepository({
  root: process.cwd()
});
```

## Scan Scope

Default inventory prefers git-tracked files from `git ls-files`. Untracked local files are opt-in through scanner-core inventory options. Non-Git directories can fall back to a filesystem walk with default ignores for dependency folders, build output, caches, generated artifacts, binary files, and local-only files.

Tracked code, config, documentation, and agent-instruction files stay in scope, but detectors should handle them differently:

- Code files are parsed for source facts.
- Config files are parsed for manifests, services, commands, and dependencies.
- Documentation and agent-instruction files are detected as guidance sources without broad prose summarization.

## Fact Taxonomy

Phase 3 detector domains and fact kinds:

- `language.detected`
- `package_manager.detected`
- `framework.detected`
- `application.detected`
- `service.detected`
- `entrypoint.detected`
- `command.detected`
- `dockerfile.detected`
- `compose.file_detected`
- `compose.service_detected`
- `devcontainer.detected`
- `environment.variable_detected`
- `database.dependency_detected`
- `cache.dependency_detected`
- `migration.directory_detected`
- `seed.directory_detected`
- `api.route_file_detected`
- `worker.detected`
- `generated.path_detected`
- `documentation.detected`
- `agent_instruction.detected`
- `repo_skill.detected`
- `legacy.marker_detected`
- `legacy.path_candidate_detected`
- `legacy.symbol_candidate_detected`
- `legacy.command_candidate_detected`
- `legacy.route_candidate_detected`
- `legacy.replacement_detected`
- `ci.workflow_detected`

Each fact definition declares:

- expected value shape
- accepted evidence kinds
- confidence guidance
- future consuming maintenance agents

Facts are deterministic tool outputs:

```ts
type ScannerFact<TValue = unknown> = {
  id: string;
  kind: ScannerFactKind;
  value: TValue;
  confidence: "high" | "medium" | "low";
  source: "deterministic";
  detector: string;
  evidence: ScannerEvidence[];
};
```

## Evidence And Confidence

Every fact should include at least one evidence record:

```ts
type ScannerEvidence = {
  kind: "source" | "config" | "test" | "documentation";
  source_path: string;
  line_start?: number;
  line_end?: number;
  excerpt?: string;
  detector: string;
};
```

Evidence paths must be repository-relative. Excerpts are optional and intentionally short.

Confidence is conservative:

- `high`: directly parsed from canonical config or known framework convention.
- `medium`: inferred from common project conventions or multiple weak signals.
- `low`: weak single signal that should be human-reviewed.

Legacy, deprecation, and unused-code facts are reviewable candidates only. They must not be treated as approved cleanup instructions.
