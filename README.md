# Board

Board is an agentic repository readiness platform.

The product goal is to make unfamiliar repositories easier for humans and external coding agents to understand, launch, change, and verify. Board will maintain repo-local readiness artifacts, task context, setup knowledge, and validation guidance through deterministic tools, LangGraph maintenance-agent workflows, MCP interfaces, and human approval gates.

Phase 0 is the engineering foundation. Most product behavior is intentionally placeholder-only.

## Current Phase

Phase 0 establishes:

- TypeScript/Python monorepo structure
- Root developer commands
- Package boundaries
- Placeholder app and package exports
- Baseline lint, format, typecheck, test, and build gates
- CI through `pnpm verify`
- Agent boundary documentation

Phase 0 does not implement repository contract schemas, real scanning, bootstrap execution, MCP serving, hosted indexing, GitHub App behavior, or full agent orchestration.

## Prerequisites

- Node.js 22+
- pnpm 9+
- Python 3.12+
- uv

`uv` manages the Python virtual environment in `.venv` and uses `.uv-cache` for local cache data.

## Install

```bash
pnpm install
pnpm py:sync
```

## Verify

```bash
pnpm verify
```

`pnpm verify` runs:

- Prettier format checks
- ESLint
- Ruff format and lint checks
- TypeScript type checks
- mypy
- Vitest
- pytest
- TypeScript builds

## Common Commands

```bash
pnpm build
pnpm clean
pnpm dev
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm verify
```

Python-specific commands:

```bash
pnpm py:sync
pnpm py:format
pnpm py:format:check
pnpm py:lint
pnpm py:typecheck
pnpm py:test
```

## Package Map

| Path                          | Owns                                                     |
| ----------------------------- | -------------------------------------------------------- |
| `packages/types`              | Shared TypeScript concepts and placeholder product types |
| `packages/cli`                | `board` CLI placeholder and command registration         |
| `packages/scanner`            | Deterministic scanner placeholder boundaries             |
| `packages/mcp-server`         | MCP tool metadata and server boundary                    |
| `packages/agent-orchestrator` | Agent run and workflow boundary placeholders             |
| `packages/agent-tools`        | Policy-checked tool boundary placeholders                |
| `packages/agent-memory`       | Agent memory boundary placeholders                       |
| `packages/policy`             | Policy decision boundary placeholders                    |
| `packages/approvals`          | Human approval boundary placeholders                     |
| `apps/api`                    | Hosted API placeholder                                   |
| `apps/worker`                 | TypeScript worker placeholder                            |
| `apps/web`                    | Hosted UI placeholder                                    |
| `python/agent-worker`         | Python LangGraph maintenance-agent worker placeholder    |

## Core Docs

- [MVP scope](docs/product/mvp-scope.md)
- [Engineering conventions](docs/engineering/conventions.md)
- [Local development](docs/engineering/local-development.md)
- [Agent boundaries](docs/architecture/agent-boundaries.md)
- [ADR index](docs/adr/README.md)
- [Phase roadmap](plans/phases.md)
- [Phase 0 plan](plans/phase%200/plan.md)

## Contribution Expectations

- Keep placeholders typed, tested, and easy to replace.
- Run `pnpm verify` before handing off changes.
- Do not add real product behavior in Phase 0 packages unless the relevant ticket explicitly asks for it.
- Maintenance-agent behavior must use explicit tool boundaries and approval gates. Do not give agents unrestricted shell, filesystem, network, model, or GitHub access.
