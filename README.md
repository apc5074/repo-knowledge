# Board

Board is an agentic repo-readiness platform.

The idea is to make unfamiliar codebases easier for humans and coding agents to understand, run, change, and verify. Most repos have a lot of hidden knowledge: the real setup command, which tests matter, what not to edit, which files are generated, which folder is old but still alive, and what patterns the team actually uses. Board is meant to turn that into structured, evidence-backed context.

This is still early, but the direction is clear: Board should help agents work inside a repo without guessing.

## What It Is Trying To Become

Board should be able to:

- scan a repo and understand its apps, services, scripts, env vars, tests, docs, and generated files
- maintain a `.board/repository.yaml` contract that describes how the repo works
- give coding agents task-specific context through MCP
- create repo-specific skills over time, like API writing standards based on the actual codebase
- flag legacy, deprecated, replaced, or likely-unused code for developer review
- choose the right checks for a change instead of blindly running everything
- propose agent-made changes as PRs by default
- allow local proposal apply only when a human explicitly asks for it

The goal is not an agent that edits freely. The goal is a system where agents use typed tools, evidence, policy checks, and reviewable proposals.

## What Exists So Far

Current progress:

- TypeScript/Python monorepo foundation
- shared package boundaries for CLI, scanner, MCP server, API, worker, web app, agent orchestration, tools, memory, policy, and approvals
- Python agent-worker placeholder for future LangGraph workflows
- repository contract package with Zod schemas, YAML parsing/serialization, validation, migrations, fixtures, examples, and tests
- contract models for apps, services, setup, verification, environment variables, generated/sensitive/unsafe paths, related systems, and known limitations
- detailed implementation plans for the CLI and deterministic scanner

## Agent Shape

Board is planned around specialized maintenance agents:

- **Scanner Agent**: finds deterministic repo facts
- **Contract Agent**: proposes `.board/repository.yaml` updates
- **Bootstrap Agent**: proves the repo can start
- **Verification Agent**: picks and runs relevant checks
- **Documentation Agent**: keeps onboarding and architecture docs fresh
- **Skill Agent**: creates repo-specific agent skills from real code patterns
- **Legacy Agent**: marks deprecated or likely-unused areas for review
- **Context Agent**: builds task packets for humans and coding agents
- **PR Agent**: turns maintenance work into reviewable PRs
- **Policy/Safety Agent**: keeps tools, files, secrets, and approvals bounded

## Tech Stack

- TypeScript and Node.js for the CLI, API, MCP server, and shared packages
- Python for maintenance-agent workers
- Zod for runtime schemas and repo contract validation
- LangGraph for agent orchestration
- OpenAI Agents SDK and Anthropic SDK behind a model router
- MCP for agent-facing context/tools
- PostgreSQL + pgvector for hosted facts, memory, retrieval, proposals, approvals, and run history
- Redis/Celery for hosted background workflows
- GitHub App APIs for checks, comments, issues, and PRs

## Local Setup

Prereqs:

- Node.js 22+
- pnpm 9+
- Python 3.12+
- uv

```bash
pnpm install
pnpm py:sync
pnpm verify
```

Useful commands:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```
