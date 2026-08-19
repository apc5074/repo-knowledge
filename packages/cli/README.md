# @repo-knowledge/cli

Installable local `board` CLI package.

Phase 2 establishes the public command surface, executable entrypoint, output conventions, early contract validation behavior, basic repository status, and user preference config. Most product commands are honest placeholders until later phases implement repository scanning, bootstrap, verification, diagnostics, task context, MCP tools, and agent maintenance workflows.

## Executable

The package exposes the `board` binary:

```bash
board --help
board contract validate .board/repository.yaml
board scan --json
```

The package metadata maps `board` to `./dist/index.js`. The source entrypoint is `src/index.ts`, which contains the shebang and delegates to the testable app logic in `src/app.ts`.

Local development commands:

```bash
pnpm --filter @repo-knowledge/cli build
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js --json status
node packages/cli/dist/index.js scan --json
node packages/cli/dist/index.js init --dry-run
node packages/cli/dist/index.js contract validate .board/repository.yaml
```

From the package workspace, tests can exercise the CLI in process:

```bash
pnpm --filter @repo-knowledge/cli test
```

## Command Framework

The CLI uses `commander` for command registration, global flag parsing, help output, and testable in-process execution. `createBoardProgram()` builds the Commander app, while `runBoardCli()` and `runBoardCliAsync()` return explicit `{ exitCode, stdout, stderr }` results for tests, scripts, and future agent tool wrappers.

## Command Context

Command handlers build a shared context with current working directory, resolved `--cwd` start directory, global flags, output mode, no-op printer/telemetry hooks, session ID, and optional future agent run/tool-call/approval metadata. Repository root lookup is lazy so commands such as `board --version` do not require repository state.

Repository root discovery starts from `--cwd` when provided, otherwise the process cwd. It walks upward for `.git`, and can also identify a repository by `.board/repository.yaml` when `.git` is absent. Normal not-found cases return structured results instead of throwing.

Contract path discovery respects `--config <path>` when present. Otherwise it resolves `.board/repository.yaml` under the discovered repository root, distinguishing missing repositories from missing contracts. Contract loading uses the repository contract package and maps missing contracts to exit code `4` and invalid contracts to exit code `5`.

## User Config

User config is a small preference layer for local CLI behavior. It does not store auth tokens or other secrets in Phase 2.

By default, config resolves to `config.json` inside the local data root. Set `BOARD_CONFIG_PATH` to point at a different file. Supported JSON keys are:

| Key                 | Type              | Default | Purpose                                          |
| ------------------- | ----------------- | ------- | ------------------------------------------------ |
| `telemetryEnabled`  | boolean           | `false` | Local preference for future telemetry hooks.     |
| `defaultOutputMode` | `human` or `json` | `human` | Preferred output mode for future command wiring. |
| `hostedApiUrl`      | string            | unset   | Future hosted Board API endpoint.                |
| `updateChecks`      | boolean           | `false` | Future preference for CLI update check behavior. |

Environment overrides are `BOARD_TELEMETRY`, `BOARD_OUTPUT`, `BOARD_API_URL`, and `BOARD_UPDATE_CHECKS`.

## Session IDs

Session helpers generate filename-safe IDs for local command sessions, future agent runs, and future tool calls. The current styles are `local-<uuid>`, `agent-run-<uuid>`, and `tool-call-<uuid>`. Session path helpers resolve future files such as `session.json`, `events.jsonl`, and `session.lock` under the local sessions root without creating process state.

## Local State

Local state path resolution is deterministic and does not create directories unless `ensureLocalStateDirectories()` is called. The resolver supports user data, cache, logs, sessions, and repository-scoped state directories. Repository-specific state is keyed by a hash of the local repository root and is not a place for secrets.

Default locations:

| Platform | Data root                                | Cache root                          |
| -------- | ---------------------------------------- | ----------------------------------- |
| macOS    | `~/Library/Application Support/board`    | `~/Library/Caches/board`            |
| Linux    | `${XDG_DATA_HOME:-~/.local/share}/board` | `${XDG_CACHE_HOME:-~/.cache}/board` |
| Override | `BOARD_DATA_HOME`                        | `BOARD_CACHE_HOME`                  |

## Global Flags

These flags are reserved as the stable Phase 2 interface. Some are documented before full framework wiring so later command handlers can rely on the public contract.

| Flag              | Scope  | Phase 2 behavior                                              |
| ----------------- | ------ | ------------------------------------------------------------- |
| `--help`, `-h`    | Global | Prints help.                                                  |
| `--version`, `-V` | Global | Prints the CLI package version without repository context.    |
| `--json`          | Global | Emits the common JSON envelope for runner-backed commands.    |
| `--quiet`         | Global | Reserved for nonessential human-output suppression.           |
| `--verbose`       | Global | Reserved for safe debug details.                              |
| `--cwd <path>`    | Global | Reserved for repository discovery start directory.            |
| `--config <path>` | Global | Supported by contract discovery as an explicit contract path. |
| `--no-color`      | Global | Reserved for disabling colorized output.                      |

Command-specific flags should not change the meaning of these global flags.

## Output Modes

Human output is the default. JSON output is for agents, scripts, CI, and future MCP-compatible tool responses.

Phase 2 JSON results should be deterministic and serializable. They should not require scraping human text. Future result shapes should include stable fields such as `ok`, `command`, `summary`, `data`, `warnings`, `errors`, `next_steps`, `repository`, `contract`, `session_id`, `agent_run_id`, `tool_call_id`, `approval_required`, `proposal_id`, `review_items`, and `candidate_findings`.

The common command result envelope includes `ok`, `status`, `command`, `summary`, optional `data`, `warnings`, `errors`, `next_steps`, optional timing/repository/contract metadata, `session_id`, optional agent/tool-call metadata, approval/proposal fields, review items, and candidate findings. JSON command output should use this envelope so agents and scripts do not scrape human text.

Human output is rendered from the same result envelope. It stays concise by default, includes warnings/errors/next steps when present, suppresses successful output with `--quiet`, adds safe command/session/repository/contract diagnostics with `--verbose`, and emits color only when color is enabled and stdout is a TTY. JSON output always prints one parseable object, never mixes human text into JSON, and does not emit terminal color codes.

## Errors and Runner

Operational failures use `BoardError`, which carries a stable error code, documented exit code, message, safe details, safe metadata, and next steps. Known errors are formatted without stack traces by default. Unexpected errors are converted to the internal-error shape and only include stack details when `--verbose` is enabled.

Registered command handlers run through the shared command runner. The runner builds on command context, records duration, normalizes successful results, catches known and unexpected errors, selects the output printer, returns the process exit code, records no-op telemetry lifecycle events, and flushes telemetry through the configured client.

Telemetry defaults to disabled and requires no network access. The interface includes command start/success/failure hooks plus no-op future hooks for agent runs, tool calls, approval requests, proposals, and pull request events. `BOARD_TELEMETRY=true` marks telemetry enabled for future clients, but Phase 2 still sends nothing externally and filters secret-looking property keys.

Interrupt handling maps controlled cancellation to the `interrupted` error code and exit code `8`. Runner tests can pass an abort signal directly; future entrypoint/runtime work can attach the provided `SIGINT`/`SIGTERM` handlers and cleanup hooks without changing command result output.

MVP placeholder handlers live in command modules and are registered through the same runner as real commands. They support human and JSON output, have command-specific help, and state clearly that implementation belongs to a later phase. `board init` is a real command that runs the deterministic initialization workflow, previews or writes `.board/repository.yaml`, and exposes proposal/review data for agents through JSON output. `board status` is a real command that reports repository discovery, contract validity, local state paths, CLI version, and a deferred runtime-services note. `board scan` is an experimental developer command that runs the deterministic scanner, prints a concise human summary by default, and includes the normalized scan result under `data.scan` for JSON output. `board contract validate` is a real command module wired into the command tree; it uses Phase 1 contract parsing, supports explicit path and `--config`, and returns structured validation details in JSON failure output.

## Testing Commands

Command tests should prefer the in-process harness in `test/harness.ts`. It can run CLI commands with fake cwd/env, parse JSON output, create temporary repository and contract fixtures, and create deterministic command contexts for handler-level tests. Subprocess tests are reserved for the focused E2E smoke coverage in a later ticket.

## Exit Codes

| Code | Meaning                     |
| ---- | --------------------------- |
| `0`  | Success.                    |
| `1`  | General failure.            |
| `2`  | Usage error.                |
| `3`  | Repository not found.       |
| `4`  | Contract not found.         |
| `5`  | Contract invalid.           |
| `6`  | Command not implemented.    |
| `7`  | External command failed.    |
| `8`  | Interrupted.                |
| `9`  | Permission or access error. |
| `10` | Unexpected internal error.  |

Early placeholder code may still return `1` for failures until the full Phase 2 error model is wired. Later tickets should converge command behavior on this table.

`board contract validate` already uses `4` for missing contracts and `5` for invalid contracts.

## MVP Commands

| Command                   | Phase 2 behavior                                                                  |
| ------------------------- | --------------------------------------------------------------------------------- |
| `board init`              | Previews or writes the initial `.board/repository.yaml` proposal.                 |
| `board start`             | Runner-backed placeholder. Later starts local repo services/apps.                 |
| `board status`            | Reports repository discovery, contract state, local state paths, and CLI version. |
| `board scan`              | Runs deterministic scanner and prints human or JSON scan output.                  |
| `board doctor`            | Runner-backed placeholder. Later diagnoses setup and runtime issues.              |
| `board explain`           | Runner-backed placeholder. Later explains repository architecture/context.        |
| `board task`              | Runner-backed placeholder. Later assembles task-specific context.                 |
| `board verify`            | Runner-backed placeholder. Later runs selected verification checks.               |
| `board stop`              | Runner-backed placeholder. Later stops local Board-managed processes.             |
| `board contract validate` | Implemented thin shell using the repository contract parser.                      |

Common Phase 2 commands:

```bash
board --help
board --version
board --json --version
board status
board --json status
board init --dry-run
board init --write
board init --json
board scan
board scan --json
board contract validate .board/repository.yaml
board contract validate .board/repository.yaml --json
```

When no path is supplied, validation defaults to `.board/repository.yaml`.

Example human output:

```text
Repository found; contract valid.
```

Example JSON output:

```json
{
  "ok": true,
  "status": "success",
  "command": "status",
  "summary": "Repository found; contract valid.",
  "data": {
    "repository": {
      "found": true,
      "root": "/path/to/repo"
    },
    "contract": {
      "found": true,
      "valid": true,
      "path": "/path/to/repo/.board/repository.yaml"
    },
    "runtime": {
      "managed_services_running": false
    }
  }
}
```

The actual JSON result also includes stable envelope fields such as `warnings`, `errors`, `next_steps`, `session_id`, `review_items`, and `candidate_findings`.

## Troubleshooting

If `board status` reports `Repository not found.`, run it from inside a Git repository or pass an explicit start directory:

```bash
board --cwd /path/to/repo status
```

If `board status` or `board contract validate` reports a missing contract, run `board init --dry-run` to review a generated proposal, then `board init --write` to create `.board/repository.yaml`.

If contract validation reports `repository.type` or `repository.primary_language` issues, fix the contract fields and rerun:

```bash
board contract validate .board/repository.yaml
```

Phase 2 does not start local services, scan repositories, select tests, generate repo skills, expose MCP tools, or run maintenance agents. Those behaviors are deliberately deferred to later phases; Phase 2 only locks down the CLI shell, result shape, and early repository/contract checks.

## Reserved Future Groups

These command groups are reserved so later phases do not need to redesign names or output conventions:

| Command group          | Future purpose                                       |
| ---------------------- | ---------------------------------------------------- |
| `board scan`           | Deterministic repository fact scanning.              |
| `board skills list`    | List generated or proposed repo skills.              |
| `board skills explain` | Explain a repo skill and its evidence.               |
| `board legacy list`    | List legacy/deprecation candidates.                  |
| `board legacy explain` | Explain a legacy/deprecation candidate and evidence. |
| `board agent run`      | Future local maintenance-agent execution surface.    |
| `board agent status`   | Future local maintenance-agent status surface.       |
| `board proposal apply` | Future approval-aware proposal application.          |

Generated docs, repo skills, legacy/deprecation findings, issue comments, and cleanup PRs must be represented as proposals or candidates until reviewed.
