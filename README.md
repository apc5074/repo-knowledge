# Board

Board is an agentic solution to keep repos up to date and fresh.

The agents will make any codebase easier for humans/agents to understand, run, and edit.

Still early dev, but want to target problems of ai coded services that get to 100k+ LOC

## What It Is Trying To Become

Board should be able to:

- scan repo and understand the different files, services, env vars, test, etc
- give coding agents (codex, claude, etc) task specific context via MCP
- create repo specific skills over time (API style, how to add service, frontend design)
- flag legacy, deprecated, likely-unused code for dev review
- propose all changes by opening up PRs
- tag likely owners of code

Want to make coding agents job as easy as possible - slim down ai gen code + real time context on logic

## What Exists So Far

There is already a real foundation here:

- a TypeScript/Python monorepo with the main packages split out
- early package boundaries for the CLI, scanner, MCP server, API, worker, web app, agent orchestration, tools, memory, policy, and approvals
- a Python worker placeholder for the future agent workflows
- a repository contract package with the schemas, YAML parsing, validation, migrations, fixtures, examples, and tests
- contract models for apps, services, setup, verification, environment variables, generated/sensitive/unsafe paths, related systems, and known limitations
- detailed implementation plans for the CLI and the deterministic scanner

## Agent Shape

Board is planned around specialized maintenance agents:

- **Scanner Agent**: finds deterministic repo facts
- **Contract Agent**: proposes contract updates
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
