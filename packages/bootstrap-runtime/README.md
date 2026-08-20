# Bootstrap Runtime

Local bootstrap runtime package for Phase 5.

This package owns planning, start, status, and stop behavior for repositories described by `.board/repository.yaml`.

## Public Boundary

The CLI may call:

- `buildBootstrapPlan()`
- `startRuntime()`
- `getRuntimeStatus()`
- `stopRuntime()`

This package must not import CLI internals or render terminal output. It returns structured data that CLI commands and future Bootstrap Agent tools can consume.

## Phase 5 Boundaries

- Load typed repository-contract data.
- Build execution plans.
- Later tickets will execute contract-defined commands and manage local runtime state.
- Never invent commands.
- Never persist secrets or raw `.env` values.
- Never stop resources Board did not start and record.
