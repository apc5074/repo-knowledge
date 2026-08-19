# @repo-knowledge/scanner-core

Scanner core owns the deterministic repository scanner API, detector interface, result model, fact taxonomy, and evidence helpers.

It does not own language-specific detection logic. TypeScript, JavaScript, Python, Docker, Compose, Dev Container, CI, docs, repo skill, and legacy/deprecation detectors should live in detector packages or modules that depend on this core.

## Public API

```ts
const result = await scanRepository({
  root: "/path/to/repo",
  detectors: [detector]
});
```

An empty detector list returns a valid scan result with zero counts. Later inventory tickets will replace the current optional inventory input with Git-backed file inventory.

## Detector Interface

Detectors declare name, version, emitted fact kinds, optional file patterns/prerequisites, and a `run` method. They return facts, warnings, recoverable errors, and stats. Detectors must not print directly to stdout or stderr.

Detector failures are isolated by the runner and recorded as recoverable scan errors so one broken detector does not discard other deterministic facts.

## Inventory and Safety

`scanRepository` builds a file inventory automatically when one is not supplied. The inventory prefers `git ls-files` so default scans only use tracked files. If Git metadata is unavailable, it falls back to a filesystem walk with the same safety rules.

Inventory entries include repository-relative path, absolute path, extension, size, category, manifest flag, and whether the file is safe to read. Categories are `code`, `config`, `documentation`, `agent-instruction`, `generated-managed`, `binary`, and `unknown`.

Default scans skip `.git`, `node_modules`, virtual environments, build output, caches, coverage, local `.env` files, binary assets, and oversized files. `.env.example`, `.env.sample`, and `.env.template` may be included as config files for variable-name detection, but local env values should not be read or emitted.

Detectors should use the scan context `readFile` and `readFileIfSafe` helpers instead of reading files directly. Reads are cached for one scan and refuse files that are not in the inventory or are marked unsafe.

## Source Locations

Source-location helpers provide pragmatic line lookup for config keys, strings, and regex matches when a parser does not expose source maps. Evidence can include line numbers and short excerpts, but detectors may omit locations when they are unavailable.

## Built-In Detectors

`createPackageManagerDetector` detects npm, pnpm, yarn, poetry, uv, pip, and pip-tools from package manifests, lockfiles, `pyproject.toml`, and requirements files. It emits `package_manager.detected` facts with config evidence and marks strong explicit package-manager fields or Python lockfile/project signals as primary.

`createLanguageDetector` detects TypeScript, JavaScript, Python, and Go from tracked source files and canonical manifests. Manifest signals carry high confidence, while extension-only findings use medium confidence.

`parseJavaScriptPackageManifest`, `parseTypeScriptConfig`, and `createJavaScriptManifestDetector` parse package metadata without executing scripts. The detector emits application facts for package boundaries and command facts for package scripts, with warnings for invalid JSON.

`createJavaScriptFrameworkDetector` detects Next.js, Vite, Express, Fastify, NestJS, React, Node CLI packages, and generic worker packages from dependencies, config files, `bin`, and package scripts. It emits framework facts and application candidates with conservative confidence.

`createJavaScriptCommandDetector` emits normalized command facts for common package scripts such as `dev`, `start`, `build`, `test`, `lint`, `typecheck`, migration, seed, and health-check commands. Command facts include the package working directory and package-manager context when declared.

`createJavaScriptEntrypointDetector` detects Node, browser, CLI, API, and worker entrypoints from `main`, `bin`, `exports`, common script command targets, and common framework file conventions.

`createJavaScriptRouteDetector` detects API route files for Next.js `pages/api`, Next.js app router route handlers, NestJS controllers, and common Express/Fastify route files. Route details are included when they are available from file conventions.

`createJavaScriptEnvDetector` detects `process.env.NAME`, bracket-form `process.env["NAME"]`, and variable names from safe env example files. It emits names only and classifies secret-looking variables without emitting env values.

`parsePythonManifest` and `createPythonManifestDetector` parse `pyproject.toml`, requirements files, shallow setup files, and Python lockfile presence. The detector emits package-manager, Python package application, framework, database, and cache dependency facts from manifest evidence without installing packages.

`analyzePythonSource`, `createPythonFrameworkDetector`, and `createPythonSourceDetector` inspect Python source text without executing imports. They detect common framework imports/declarations, app candidates, Python entrypoints, database/cache imports, and recoverable syntax warnings.

`createPythonCommandDetector` detects common Python test, lint, typecheck, migration, start, Django, and Celery worker commands from `pyproject.toml`, task files, `manage.py`, and Python source declarations.

`createPythonRouteDetector` detects FastAPI and Flask route decorators plus Django URL configuration files. It emits route-file facts with source evidence and preserves recoverable warnings for likely syntax errors.

`parseDockerfile` and `createDockerfileDetector` detect Dockerfiles, base images, stages, exposed ports, workdir, runtime command/entrypoint, and copied package manifests with line-based parsing.

`parseComposeFile` and `createComposeDetector` parse Compose YAML files, emit file/service facts, detect PostgreSQL and Redis service dependencies, preserve service command evidence, and emit environment variable names without environment values.

`parseDevContainerConfig` and `createDevContainerDetector` detect `.devcontainer` configs, Dockerfile or Compose references, features, forwarded ports, selected services, workspace folders, and lifecycle setup command candidates. The parser supports common JSONC comments and trailing commas.

`parseGitHubActionsWorkflow` and `createGitHubActionsDetector` parse GitHub Actions workflows, emit CI workflow facts with triggers/jobs/setup actions/language versions, and extract explicit validation command candidates for test, lint, typecheck, and build workflows.

`parseScriptFile` and `createMakefileDetector` detect common Makefile and justfile targets such as setup, development, verification, test, lint, typecheck, migration, seed, and health-check commands without executing recipes.

`parseEnvExampleFile` and `createEnvFileDetector` detect variable names from safe env example files, including nested `.env.example`, `.env.sample`, `.env.template`, and `env.example` files. Evidence excerpts contain names only; real `.env` files remain excluded by inventory safety rules.

`createDatabaseDependencyDetector` detects PostgreSQL, generic database, and Redis dependencies from JS/Python manifests, safe env example names, Compose images/ports, Prisma schema files, and Alembic config. Compose port-only signals stay low confidence unless supported by stronger evidence.

`detectDataDirectories` and `createMigrationSeedDetector` detect common migration and seed directories such as `prisma/migrations`, `db/migrations`, `alembic`, `db/seeds`, and `scripts/seed` while skipping generated paths by default.

`createWorkerDetector` detects background worker and queue candidates from Celery manifests/source, Node queue packages and worker scripts, Compose worker services, and worker-like file or directory naming conventions. Explicit commands and dependencies are high confidence; ambiguous path names stay medium or low confidence.

`createGeneratedFileDetector` detects generated or managed paths from generated directories, generated filenames, OpenAPI/GraphQL signals, generation package scripts, and lockfiles. Lockfiles are marked managed without implying a regeneration command.

`createDocumentationDetector` detects tracked documentation, agent instruction files, and repo-local `.board/skills/**/SKILL.md` files without summarizing, judging, or rewriting them. Repo skill facts include the skill name, path, and cheap referenced resource paths when present.

`createLegacyDetector` emits conservative legacy/deprecation candidate facts from explicit markers, replacement hints, legacy-like paths, stale-looking scripts, simple unused-export heuristics, route markers, and missing documentation references. These facts are always review candidates and never safe-to-delete instructions.

`aggregateCandidates` and `createCandidateAggregatorDetector` aggregate prior scanner facts into application and service candidates. Aggregated facts include contributing fact IDs, preserve underlying evidence, expose conflicting signals, and keep ambiguous candidates at medium or low confidence.

Scanner warning and error handling is intentionally non-catastrophic for detector-level issues. Malformed manifests produce warnings, detector exceptions become recoverable scan errors, and fatal scan errors are reserved for cases where repository inventory cannot be constructed.

`normalizeScanResult`, `normalizeFact`, and `stableFactId` make scan output stable for tests and downstream snapshots by normalizing POSIX-style paths, recomputing deterministic fact IDs, sorting facts/evidence/warnings/errors, and optionally pinning timestamps/durations in test mode.

`createDefaultRepositoryDetectors()` returns the deterministic MVP detector set in a stable order. It is the shared entry point for integration tests, the developer-facing scan command, and future agent tool wrappers.

Scanner fixture repositories live under `test/fixtures/repos` and cover TypeScript APIs with PostgreSQL/Redis, Python APIs with PostgreSQL, monorepos, API-plus-worker repos, frontend-plus-API repos, Docker Compose, Dev Containers, GitHub Actions CI, generated files, repo-local skills, legacy/deprecation candidates, and invalid configuration files.

Integration tests scan those fixtures with the full detector set, assert key evidence-backed facts, verify malformed config is recoverable scanner output, and compare normalized test-mode results for deterministic output.
