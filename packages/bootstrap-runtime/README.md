# Bootstrap Runtime

`@repo-knowledge/bootstrap-runtime` turns a `.board/repository.yaml` contract into a bounded local startup workflow for humans, CLI commands, and future Bootstrap Agent tools.

The package has no CLI dependency and does not render terminal output. It returns structured reports that callers can print, store, or pass to an agent.

## Supported Contract Fields

The runtime reads these contract sections:

- `repository`: repository identity and language metadata.
- `environment`: required and optional variable names, local defaults, and secret markers.
- `setup`: `install`, `migrate`, `seed`, `generate`, `health_check`, `smoke_check`, and custom ordered setup steps.
- `services`: Compose-backed services with `compose_service`, ports, evidence paths, and environment names.
- `applications`: app and worker commands, working directories, dependencies, ports, environment names, and health checks.

The runtime never invents commands. If a service or app has no executable command or Compose mapping, it is reported as a warning or pending plan item.

## Runtime Order

`startRuntime()` and `board start` execute in this order:

1. Load and validate `.board/repository.yaml`.
2. Build a dry-run-capable bootstrap plan.
3. Inspect local prerequisites such as `node`, `python`, `docker`, or contract-required commands.
4. Resolve required environment variables without persisting secret values.
5. Check declared ports for availability.
6. Run setup commands in contract order.
7. Start Compose services declared by `compose_service`.
8. Start app and worker processes from contract commands.
9. Check listening ports and run health checks.
10. Persist session state for `board status`, `board stop`, and future agent tools.

`--dry-run` builds the plan without writing runtime state or executing commands.

## Local State

Runtime state is stored below the repository-local Board state root selected by the CLI:

- `runtime/latest.json`: latest runtime session pointer.
- `runtime/sessions/<session-id>.json`: persisted session, steps, resources, warnings, and errors.
- `runtime/processes.json`: Board-managed process records used by status and stop.

State stores command names, args, cwd, statuses, durations, and bounded output excerpts. It does not store raw `.env` files or secret values. Runtime output is redacted using selected environment values and explicit redaction helpers.

## Process Ownership

Board only stops resources it started and recorded:

- app and worker processes registered in `runtime/processes.json`.
- Compose projects with a Board-generated project name stored in session resource metadata.

Board does not scan for arbitrary processes by port, process name, or command string. If a process was not started and recorded by Board, `board stop` will not stop it.

## Compose Behavior

Services with `compose_service` are started with:

```bash
docker compose -p <board-project> up -d <service>
```

The project name is deterministic for the repository root and session id. Compose files are discovered from service evidence paths that point at `compose.yaml`, `compose.yml`, `docker-compose.yaml`, or `docker-compose.yml`.

Normal tests do not require Docker. Optional real Compose tests are gated by:

```bash
BOARD_DOCKER_COMPOSE_TESTS=1 pnpm --filter @repo-knowledge/bootstrap-runtime test -- --run test/compose.integration.test.ts
```

## Dev Containers

The package can detect and report Dev Container requirements, but Phase 5 does not run inside Dev Containers or rebuild containers automatically. Future Bootstrap Agent workflows can use the report to decide whether to recommend or request a containerized setup path.

## Health Checks

Applications and services may define URL or command health checks. Command health checks use the same command runner and redaction behavior as setup. URL health checks are bounded and report status, elapsed time, and safe excerpts.

Health checks can be disabled with CLI `--no-health-check` or the corresponding runtime input.

## Performance Budget

Phase 5 keeps local bootstrap bounded with these defaults:

- command timeout: 120 seconds
- health-check timeout: 5 seconds
- startup timeout: 600 seconds
- output excerpt limit: 8 KB
- max setup steps per start: 25
- max tracked app/worker processes per start: 8
- app readiness probe window: 500 ms

CLI `board start --timeout <seconds>` overrides the startup timeout budget. Programmatic callers can pass a runtime budget override to `startRuntime()` or `startBootstrapRuntimeTool()`.

Reports include aggregate command, health-check, and completed-session durations where available.

## CLI Examples

```bash
board start --dry-run
board start --json
board status
board status --json
board stop
board stop --force --json
```

## Agent Usage

Future Bootstrap Agent workflows should use the agent-compatible wrappers exported from this package instead of shelling out to the CLI:

- `planBootstrapRuntimeTool()`
- `startBootstrapRuntimeTool()`
- `getBootstrapRuntimeStatusTool()`
- `stopBootstrapRuntimeTool()`

The wrappers include metadata for local side effects, policy placeholders, and redaction guarantees. Agent orchestration remains outside this package.

## Troubleshooting

- Missing contract: run `board init` or pass the correct `--config` path.
- Invalid contract: run `board contract validate` and fix the reported issue paths.
- Missing environment: set required variables locally or add safe `default_for_local` values for non-secret variables.
- Failed setup: inspect the failed step id and command result, fix the local issue, then rerun `board start`.
- Timed out startup: increase `board start --timeout <seconds>` only after checking which step exhausted the budget.
- Stale process state: run `board status`, then `board stop --force` if a recorded process no longer responds normally.
- Compose failures: confirm Docker is running, the service name exists, and the compose file evidence path is correct.

## Safety Boundaries

- No CLI imports.
- No invented commands.
- No raw secret persistence.
- No unbounded command output.
- No stopping unrelated local resources.
- No LangGraph or model orchestration in Phase 5.
