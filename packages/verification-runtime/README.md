# @repo-knowledge/verification-runtime

This package owns local `board verify` planning, execution, reports, history, and the deterministic tool surface future agents can call.

## Configure Checks

Verification lives in `.board/repository.yaml`.

```yaml
verification:
  default:
    - id: typecheck
      command:
        command: pnpm
        args: [typecheck]
  rules:
    - id: api
      paths:
        - apps/api/**
      components:
        - api
      checks:
        - id: api-tests
          command:
            command: pnpm
            args: [--filter, api, test]
    - id: docs
      paths:
        - docs/**
      commands:
        - command: pnpm
          args: [docs:check]
```

`verification.default` checks run for normal `board verify` unless `--no-default` or `--changed` is used. Use defaults for broad checks like lint, typecheck, build, smoke, or repo-wide unit tests.

`verification.rules` select checks by changed paths and explicit component requests. Rule `checks` are full verification checks with stable IDs. Rule `commands` are supported for compatibility and become synthetic checks using a stable `<rule-id>:command:<index>` ID.

Path patterns are repository-relative and use `/` separators. Component IDs must be known through applications, services, rule components, or check components in the contract.

## Run Checks

```bash
board verify
board verify --json
board verify --dry-run
board verify --changed
board verify --all
board verify --paths apps/api/src/routes.ts
board verify --component api
board verify --check api-tests
board verify --skip smoke
board verify --no-default
board verify --timeout 30
```

Default `board verify` detects local Git changes and runs default checks plus checks selected by matching rules. `--changed` runs only checks selected by detected changes. `--all` runs every configured check. `--dry-run` returns the plan without executing commands.

The command reports `passed`, `failed`, `timed_out`, `blocked`, `skipped`, `not_configured`, and `unknown` states. Failed or timed-out required checks return a failing CLI result. Missing required environment variables block the affected checks.

## Output And History

Human output is short and actionable. `--json` returns the same run facts in a stable command result shape with the verification plan, run record, summary, warnings, and errors.

Completed CLI runs write bounded local history through the Phase 2 state directory:

```text
verification/
  runs/<run_id>.json
  latest.json
  history.json
```

Captured stdout and stderr are bounded and redacted before they are returned or persisted. Secret environment values selected for a check are replaced with `[redacted]`.

## Agent Tool Surface

Future orchestration can call `runVerificationTool()` directly. It accepts structured options such as `repositoryRoot`, `dryRun`, `changedPaths`, `requestedPaths`, `requestedComponentIds`, `requestedCheckIds`, `skippedCheckIds`, and timeout/env settings. It returns a typed run record plus JSON-compatible serialization and does not print terminal output.

## What it should not do yet

- LLM-based reasoning
- hosted sync
- GitHub PR automation
- agent orchestration
- repo graph analysis beyond the basic matching rules in the contract
