# Package Map

Use this as the quick ownership map. If this conflicts with a package README or `package.json`, inspect the code and update this file.

## Core Implemented Packages

| Package                                | Owns                                                            | Public Entry                                 | Main Dependencies                          | Notes                                                                       |
| -------------------------------------- | --------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `@repo-knowledge/repository-contract`  | Repository contract schema, parse, validate, migrate, serialize | `packages/repository-contract/src/index.ts`  | `yaml`, `zod`-style schema code in package | Contract changes must update examples and validation tests.                 |
| `@repo-knowledge/scanner-core`         | Deterministic repo fact detection                               | `packages/scanner-core/src/index.ts`         | `@repo-knowledge/types`, `yaml`            | Detector logic belongs here. Facts should include evidence.                 |
| `@repo-knowledge/scanner`              | Public scanner facade                                           | `packages/scanner/src/index.ts`              | `@repo-knowledge/scanner-core`             | Should delegate to scanner-core, not duplicate detector logic.              |
| `@repo-knowledge/init-core`            | Contract initialization proposals and writes                    | `packages/init-core/src/index.ts`            | `repository-contract`, `scanner-core`      | Produces reviewable init outputs. CLI should not own this logic.            |
| `@repo-knowledge/bootstrap-runtime`    | Local setup/start/status/stop runtime                           | `packages/bootstrap-runtime/src/index.ts`    | `repository-contract`                      | Runtime state and process behavior belong here.                             |
| `@repo-knowledge/verification-runtime` | Verification selection, execution, history, reports             | `packages/verification-runtime/src/index.ts` | `bootstrap-runtime`, `repository-contract` | Check selection must stay explainable and structured.                       |
| `@repo-knowledge/cli`                  | `board` CLI command tree, context, output, errors               | `packages/cli/src/index.ts`                  | core packages, `commander`                 | CLI adapts flags and output. It should stay thin.                           |
| `@repo-knowledge/types`                | Shared type vocabulary                                          | `packages/types/src/index.ts`                | none                                       | Do not use it as a generic status or phase source for implemented packages. |

## Planned Or Early Shell Packages

These packages may contain stable metadata, early types, or placeholder surfaces. Do not assume product behavior exists unless tests and docs prove it.

| Package                              | Intended Area                       | Current Rule                                                           |
| ------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------- |
| `@repo-knowledge/agent-memory`       | Agent memory and retrieval metadata | Treat as early shell unless implementation tests say otherwise.        |
| `@repo-knowledge/agent-orchestrator` | Maintenance-agent orchestration     | Treat as early shell unless implementation tests say otherwise.        |
| `@repo-knowledge/agent-tools`        | Policy-checked agent tool boundary  | Treat as early shell unless implementation tests say otherwise.        |
| `@repo-knowledge/approvals`          | Human approval boundary             | Treat as early shell unless implementation tests say otherwise.        |
| `@repo-knowledge/mcp-server`         | Local and hosted MCP interfaces     | Treat as early shell unless implementation tests say otherwise.        |
| `@repo-knowledge/policy`             | Agent safety and policy             | Treat as early shell unless implementation tests say otherwise.        |
| `@repo-knowledge/doctor-runtime`     | Diagnostics runtime                 | Inspect before using; do not expose through CLI without working tests. |

## Apps

| App                   | Intended Area                      | Current Rule                                               |
| --------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `apps/api`            | Future hosted API                  | Treat as shell unless tests prove behavior.                |
| `apps/web`            | Future hosted web UI               | Treat as shell unless tests prove behavior.                |
| `apps/worker`         | Future hosted/background worker    | Treat as shell unless tests prove behavior.                |
| `python/agent-worker` | Python maintenance-agent workflows | Use Python commands and `uv`; inspect workflow docs first. |

## Dependency Rules

- If source imports a workspace package, the package must list it in `dependencies`.
- If a dependency is removed from source, remove it from `package.json` and refresh `pnpm-lock.yaml`.
- Do not add package dependencies for type or metadata shortcuts unless the package truly needs them.
- Avoid dependency cycles. If a new edge looks questionable, inspect package ownership first.
- For direct package tests that need built dependency exports, prefer dependency-closure filters over hard-coded package chains.

## Public Export Rules

- Public exports should be deliberate and tested.
- Do not export internal helpers just because tests need them.
- If another package needs an API, promote it through the owning package root.
- Public facade packages should expose stable inputs/results and delegate internally.

## Package Status Rule

Implemented packages should carry their own status or phase metadata. Do not inherit placeholder metadata from `@repo-knowledge/types`.
