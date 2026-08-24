# Commands

Use the smallest command that proves the change. Use broader commands when changing shared APIs, package manifests, public exports, or CLI behavior.

## Full Repo

```bash
pnpm verify
```

Runs format, lint, typecheck, tests, and build across TypeScript and Python.

## Formatting

```bash
pnpm format:check
pnpm format
```

Use `format:check` to verify. Use `format` only when files need formatting.

## TypeScript Packages

```bash
pnpm --filter @repo-knowledge/<package> test
pnpm --filter @repo-knowledge/<package> typecheck
pnpm --filter @repo-knowledge/<package> build
```

Examples:

```bash
pnpm --filter @repo-knowledge/cli test
pnpm --filter @repo-knowledge/scanner-core test
pnpm --filter @repo-knowledge/repository-contract typecheck
```

## Python

```bash
pnpm py:format:check
pnpm py:lint
pnpm py:typecheck
pnpm py:test
```

## When To Run What

- Docs-only change: `pnpm exec prettier <file> --check` or `pnpm format:check`.
- Single package behavior change: package `test` and package `typecheck`.
- Public export change: package `build`, package `test`, package `typecheck`.
- CLI behavior change: `pnpm --filter @repo-knowledge/cli test`, `typecheck`, and `build`.
- Manifest or lockfile change: affected package checks plus `pnpm install --lockfile-only` when dependency edges change.
- Shared package change: direct package checks plus downstream package checks that import it.
- Broad cross-package cleanup: `pnpm verify` when practical.

## Test File Rules

- Do not add scratch tests in the repo root.
- Do not create temporary scripts under `packages/*` just to probe behavior.
- Use existing package test folders.
- Use existing fixtures before adding new fixture directories.
- Put temporary experiments in `/tmp` and remove them when done.

## Notes

- Some package tests build dependency closures first with pnpm filters.
- If a package import changes, make sure `package.json` and `pnpm-lock.yaml` agree.
- If a command fails because local dependencies are missing after a lockfile operation, restore with `pnpm install`.
