# Codex Context

Use this after `AGENTS.md` when starting work in this repo.

## Product Summary

Board is a local-first repo readiness system. It helps coding agents and humans understand a repository, create a contract for how it works, start local services, and run the right checks.

The near-term goal is not a large hosted platform. The near-term goal is a clean, reliable local toolchain with strong package boundaries and no fake working paths.

## Current Working Shape

- TypeScript monorepo managed with `pnpm` and `turbo`.
- Python worker area managed with `uv`.
- Public CLI is `board` from `packages/cli`.
- Repository truth is represented by `.board/repository.yaml`.
- Deterministic facts come from scanner detectors with evidence.
- Runtime and verification are package-owned, not CLI-owned.

## Implemented Core Packages

- `repository-contract`: parses and validates repository contracts.
- `scanner-core`: detects repo facts from files and manifests.
- `scanner`: public facade over `scanner-core`.
- `init-core`: proposes or writes repository contracts from scanner facts.
- `bootstrap-runtime`: plans and manages local setup/start/status/stop flows.
- `verification-runtime`: selects and runs verification checks, records history, and formats reports.
- `cli`: adapts package behavior into user-facing `board` commands.

## Important Boundaries

- CLI command modules should stay thin.
- Core behavior belongs in the owning package.
- Workspace imports should use package names, not `../dist` paths.
- Public facade packages should delegate to core packages.
- Package manifests should list only real imports.
- Public metadata should describe implemented behavior, not inherited placeholder phase names.

## Current Cleanup Direction

The repo is being consolidated before more phase 6 work continues.

Priorities:

- Keep only working user-facing command paths.
- Remove stale placeholder language from implemented packages.
- Make package dependencies explicit and accurate.
- Keep generated or temporary test files out of the repo root.
- Prefer small docs that route agents to the right files over long background essays.

## Communication Style

Explain changes in simplified technical talk:

- What changed.
- Why it matters.
- What was checked.
- What still needs attention, if anything.

Avoid vague claims like "improved architecture" without naming the concrete boundary or behavior.
