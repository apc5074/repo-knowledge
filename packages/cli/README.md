# @repo-knowledge/cli

Installable local `board` CLI package.

The CLI exposes the local `board` command surface for repository initialization, contract validation, repository scanning, runtime start/status/stop, and verification.

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

User config is a small preference layer for local CLI behavior. It does not store auth tokens or other secrets.

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

These flags are the stable global interface shared by runner-backed commands.

| Flag              | Scope  | Behavior                                                      |
| ----------------- | ------ | ------------------------------------------------------------- |
| `--help`, `-h`    | Global | Prints help.                                                  |
| `--version`, `-V` | Global | Prints the CLI package version without repository context.    |
| `--json`          | Global | Emits the common JSON envelope for runner-backed commands.    |
| `--quiet`         | Global | Suppresses nonessential human output.                         |
| `--verbose`       | Global | Includes safe debug details.                                  |
| `--cwd <path>`    | Global | Reserved for repository discovery start directory.            |
| `--config <path>` | Global | Supported by contract discovery as an explicit contract path. |
| `--no-color`      | Global | Reserved for disabling colorized output.                      |

Command-specific flags should not change the meaning of these global flags.

## Output Modes

Human output is the default. JSON output is for agents, scripts, CI, and future MCP-compatible tool responses.

JSON results are deterministic and serializable. They should not require scraping human text. Result shapes should use stable fields such as `ok`, `command`, `summary`, `data`, `warnings`, `errors`, `next_steps`, `repository`, `contract`, `session_id`, `agent_run_id`, `tool_call_id`, `approval_required`, `proposal_id`, `review_items`, and `candidate_findings`.

The common command result envelope includes `ok`, `status`, `command`, `summary`, optional `data`, `warnings`, `errors`, `next_steps`, optional timing/repository/contract metadata, `session_id`, optional agent/tool-call metadata, approval/proposal fields, review items, and candidate findings. JSON command output should use this envelope so agents and scripts do not scrape human text.

Human output is rendered from the same result envelope. It stays concise by default, includes warnings/errors/next steps when present, suppresses successful output with `--quiet`, adds safe command/session/repository/contract diagnostics with `--verbose`, and emits color only when color is enabled and stdout is a TTY. JSON output always prints one parseable object, never mixes human text into JSON, and does not emit terminal color codes.

## Errors and Runner

Operational failures use `BoardError`, which carries a stable error code, documented exit code, message, safe details, safe metadata, and next steps. Known errors are formatted without stack traces by default. Unexpected errors are converted to the internal-error shape and only include stack details when `--verbose` is enabled.

Registered command handlers run through the shared command runner. The runner builds on command context, records duration, normalizes successful results, catches known and unexpected errors, selects the output printer, returns the process exit code, records no-op telemetry lifecycle events, and flushes telemetry through the configured client.

Telemetry defaults to disabled and requires no network access. The interface includes command start/success/failure hooks plus no-op future hooks for agent runs, tool calls, approval requests, proposals, and pull request events. `BOARD_TELEMETRY=true` marks telemetry enabled for future clients, but the local CLI still sends nothing externally and filters secret-looking property keys.

Interrupt handling maps controlled cancellation to the `interrupted` error code and exit code `8`. Runner tests can pass an abort signal directly; future entrypoint/runtime work can attach the provided `SIGINT`/`SIGTERM` handlers and cleanup hooks without changing command result output.

Command handlers live in command modules and run through the shared runner. `board init` runs the deterministic initialization workflow, previews or writes `.board/repository.yaml`, and exposes proposal/review data for agents through JSON output. `board status` reports repository discovery, contract validity, local state paths, CLI version, and runtime state. `board scan` runs the deterministic scanner, prints a concise human summary by default, and includes the normalized scan result under `data.scan` for JSON output. `board verify` selects and runs contract-defined verification checks. `board start` and `board stop` manage Board-declared local runtime resources. `board contract validate` uses the repository contract parser, supports explicit path and `--config`, and returns structured validation details in JSON failure output.

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

`board contract validate` already uses `4` for missing contracts and `5` for invalid contracts.

## Commands

| Command                        | Behavior                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `board init`                   | Previews or writes the initial `.board/repository.yaml` proposal.                 |
| `board start`                  | Starts local repo services/apps declared in the repository contract.              |
| `board status`                 | Reports repository discovery, contract state, local state paths, and CLI version. |
| `board scan`                   | Runs deterministic scanner and prints human or JSON scan output.                  |
| `board verify`                 | Runs contract-defined verification checks selected by Git changes or flags.       |
| `board stop`                   | Stops local Board-managed runtime resources.                                      |
| `board contract validate`      | Implemented thin shell using the repository contract parser.                      |
| `board graph build`            | Builds the local repository graph under `.board/state/graph`.                     |
| `board graph status`           | Reports whether a local graph build is available.                                 |
| `board graph related <target>` | Lists bounded graph relationships for a target.                                   |
| `board graph explain <target>` | Returns an evidence-backed graph explanation.                                     |

Common commands:

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
board verify
board verify --json
board verify --dry-run --paths apps/api/src/routes.ts
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

The CLI does not expose placeholder commands. Future command groups should be added to the executable surface only when they have working handlers and tests.

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
