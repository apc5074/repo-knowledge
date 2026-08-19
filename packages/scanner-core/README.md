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
