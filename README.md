# Board

Board is an agentic solution to keep repos up to date and fresh.

The agents will make any codebase easier for humans/agents to understand, run, and edit.

Still early dev, but want to target problems of ai coded services that get to 100k+ LOC

## Final Goal

Board should be able to:

- scan repo and understand the different files, services, env vars, test, etc
- give coding agents (codex, claude, etc) task specific context via MCP
- create repo specific skills over time (API style, how to add service, frontend design)
- flag legacy, deprecated, likely-unused code for dev review
- propose all changes by opening up PRs
- tag likely owners of code

Want to make coding agents job as easy as possible - slim down ai gen code + real time context on logic

## Repo As Context

The main idea is simple: do not treat a repo like one giant prompt.

Board turns the repo into structured data first. The scanner walks the codebase and records facts like package scripts, entry points, services, env vars, routes, tests, generated files, schemas, migrations, docs, and unsafe paths. Each fact keeps where it came from: file, lines, detector, commit SHA, confidence, and verification status.

Then we build a graph on top of those facts. Files connect to symbols, symbols connect to routes, routes connect to tests, services connect to env vars, schemas connect to generated clients, and migrations connect to data models. That gives agents a map instead of a pile of files.

Memory is also structured:

- **Run memory**: temporary state for one agent run, like what tools were called, what files were read, and what still needs approval.
- **Repo memory**: durable knowledge for one repository, like accepted setup steps, known problems, reviewed legacy findings, repo-specific coding patterns, and false positives that should not be repeated.
- **Organization memory**: shared knowledge across repos, like related services, API consumers, deprecated shared packages, ownership, and cross-repo known problems.

The goal is not to save chat transcripts. It is to save useful repo knowledge with evidence and review state. If Board once thought a file was unused and a maintainer rejected that because it is loaded dynamically, that becomes memory the next agent can use.

When Codex, Claude, or another coding agent asks for context through MCP, Board sends a small task packet:

- what the task likely touches
- the files, symbols, routes, and schemas that matter
- similar implementations
- request, event, or data flow if we can trace it
- generated or risky files to avoid
- tests and validation commands
- known problems, legacy notes, and repo-specific skills

Search is hybrid: lexical search, symbol lookup, import graph traversal, route/schema matching, test relationships, known problems, accepted skills, and embeddings. Embeddings help find candidates, but they are not proof. Important claims still point back to source evidence.

The result is that agents do not need to rediscover the repo every session. They get a compact, evidence-backed slice of the codebase that is relevant to the task in front of them.

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
