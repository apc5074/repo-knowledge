# Agent Guide

This file is the repo-wide starting context for coding agents. Keep it short, current, and operational.

## What This Repo Is

Board is a local-first repo readiness system. It helps humans and coding agents understand, run, verify, and maintain codebases with less guessing.

Current work is focused on a clean TypeScript/Python monorepo with deterministic repo facts, a repository contract, CLI workflows, local runtime bootstrap, and verification selection.

## Agent Operating Rules

- Start by reading this file, then read the package README and tests for the area you will edit.
- Prefer small, direct changes that preserve package boundaries.
- Explain work in simple technical language: what changed, why it changed, and how it was checked.
- Do not expose placeholder user paths as if they work.
- Do not import another workspace package through its `dist` path. Use the package name.
- Do not duplicate core logic in public wrapper packages. Public packages should delegate to core packages.
- Do not rewrite unrelated files or revert changes you did not make.
- If the worktree is dirty, treat unrelated changes as user-owned.

## Test File Discipline

- Do not create random one-off test files, scratch scripts, or ad hoc fixtures in the repo root.
- Add tests only next to the package or behavior being changed.
- Reuse existing harnesses, fixtures, and test helpers before creating new ones.
- Create new fixtures only when an existing fixture cannot express the case clearly.
- If temporary local probing is needed, use `/tmp` or the OS temp directory, not the repository.
- Delete temporary files before finishing.

## Package Map

- `packages/repository-contract`: YAML contract schema, parsing, validation, migrations, examples, and contract tests.
- `packages/scanner-core`: deterministic repository detectors, evidence-backed facts, inventory, detector orchestration, and scanner fixtures.
- `packages/scanner`: public scanner package that delegates to `scanner-core`.
- `packages/init-core`: scanner-backed contract initialization and proposal generation.
- `packages/bootstrap-runtime`: local setup/start/status/stop planning and runtime state.
- `packages/verification-runtime`: verification check selection, execution, reports, history, and agent-facing output.
- `packages/cli`: `board` command registration, command context, output envelopes, errors, telemetry hooks, and CLI tests.
- `packages/types`: shared type vocabulary. Do not use it as a generic package-status source for implemented packages.
- `apps/*` and early agent packages: mostly shell surfaces unless tests/docs show implemented behavior.
- `python/agent-worker`: future maintenance-agent worker workflows.

## Task Routing

- CLI change: read `packages/cli/README.md`, `packages/cli/src/app.ts`, the command module, and related `packages/cli/test/*` files.
- Contract change: read `docs/repository-contract.md`, `packages/repository-contract/src/schema.ts`, examples, and validation tests.
- Scanner change: read `packages/scanner-core/README.md`, relevant detector files, fixtures, and scanner-core tests.
- Init change: read `packages/init-core/README.md`, `packages/init-core/src/init.ts`, proposal/review modules, and init-core tests.
- Bootstrap runtime change: read `docs/bootstrap-runtime.md`, `packages/bootstrap-runtime/README.md`, plan/runtime/state modules, and runtime tests.
- Verification change: read `packages/verification-runtime/README.md`, selector/orchestrator/history/report modules, and verification-runtime tests.
- Cross-package change: inspect package manifests, public exports, lockfile importer changes, and direct package tests.

## Verification Commands

- Full repo confidence: `pnpm verify`
- Formatting only: `pnpm format:check`
- Package tests: `pnpm --filter @repo-knowledge/<package> test`
- Package typecheck: `pnpm --filter @repo-knowledge/<package> typecheck`
- Package build: `pnpm --filter @repo-knowledge/<package> build`
- Python only: `pnpm py:format:check`, `pnpm py:lint`, `pnpm py:typecheck`, `pnpm py:test`

Use the smallest meaningful check while iterating. Run broader checks when changing shared packages, package exports, dependency manifests, or behavior used by the CLI.

## Architecture Boundaries

- Repo facts must be deterministic and evidence-backed.
- Contract data should flow through `repository-contract`.
- Scanner behavior belongs in `scanner-core`; `scanner` is the public facade.
- Init behavior belongs in `init-core`; CLI only adapts flags and output.
- Runtime behavior belongs in `bootstrap-runtime`; CLI only adapts flags and output.
- Verification behavior belongs in `verification-runtime`; CLI only adapts flags and output.
- User-facing commands should return structured result envelopes and concise human output.

## Documentation Rules

- Update the closest README when changing a public command, package API, or workflow.
- Keep docs accurate about what works now versus what is planned.
- Prefer short operational docs over long roadmap text.
- Remove stale phase or placeholder language when behavior is implemented.

## Final Response Expectations

- State the concrete result first.
- List changed files only when useful.
- Include verification commands run and whether they passed.
- Call out anything not run.
- Keep language clear enough for a technical product owner to understand.
