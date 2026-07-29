# @repo-knowledge/cli

Installable local `board` CLI package.

Phase 2 establishes the public command surface, executable entrypoint, output conventions, and early contract validation behavior. Most product commands are honest placeholders until later phases implement repository scanning, bootstrap, verification, diagnostics, task context, MCP tools, and agent maintenance workflows.

## Executable

The package exposes the `board` binary:

```bash
board --help
board contract validate .board/repository.yaml
```

The package metadata maps `board` to `./dist/index.js`. The source entrypoint is `src/index.ts`, which contains the shebang and delegates to the testable app logic in `src/app.ts`.

## Command Framework

The CLI uses `commander` for command registration, global flag parsing, help output, and testable in-process execution. `createBoardProgram()` builds the Commander app, while `runBoardCli()` and `runBoardCliAsync()` return explicit `{ exitCode, stdout, stderr }` results for tests, scripts, and future agent tool wrappers.

## Command Context

Command handlers build a shared context with current working directory, resolved `--cwd` start directory, global flags, output mode, no-op printer/telemetry hooks, session ID, and optional future agent run/tool-call/approval metadata. Repository root lookup is lazy so commands such as `board --version` do not require repository state.

Repository root discovery starts from `--cwd` when provided, otherwise the process cwd. It walks upward for `.git`, and can also identify a repository by `.board/repository.yaml` when `.git` is absent. Normal not-found cases return structured results instead of throwing.

Contract path discovery respects `--config <path>` when present. Otherwise it resolves `.board/repository.yaml` under the discovered repository root, distinguishing missing repositories from missing contracts. Contract loading uses the repository contract package and maps missing contracts to exit code `4` and invalid contracts to exit code `5`.

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

| Flag              | Scope  | Phase 2 behavior                                                   |
| ----------------- | ------ | ------------------------------------------------------------------ |
| `--help`, `-h`    | Global | Prints help.                                                       |
| `--version`, `-V` | Global | Prints the CLI package version without repository context.         |
| `--json`          | Global | Supported by `board contract validate`; reserved for all commands. |
| `--quiet`         | Global | Reserved for nonessential human-output suppression.                |
| `--verbose`       | Global | Reserved for safe debug details.                                   |
| `--cwd <path>`    | Global | Reserved for repository discovery start directory.                 |
| `--config <path>` | Global | Supported by contract discovery as an explicit contract path.      |
| `--no-color`      | Global | Reserved for disabling colorized output.                           |

Command-specific flags should not change the meaning of these global flags.

## Output Modes

Human output is the default. JSON output is for agents, scripts, CI, and future MCP-compatible tool responses.

Phase 2 JSON results should be deterministic and serializable. They should not require scraping human text. Future result shapes should include stable fields such as `ok`, `command`, `summary`, `data`, `warnings`, `errors`, `next_steps`, `repository`, `contract`, `session_id`, `agent_run_id`, `tool_call_id`, `approval_required`, `proposal_id`, `review_items`, and `candidate_findings`.

The common command result envelope includes `ok`, `status`, `command`, `summary`, optional `data`, `warnings`, `errors`, `next_steps`, optional timing/repository/contract metadata, `session_id`, optional agent/tool-call metadata, approval/proposal fields, review items, and candidate findings. JSON command output should use this envelope so agents and scripts do not scrape human text.

Human output is rendered from the same result envelope. It stays concise by default, includes warnings/errors/next steps when present, suppresses successful output with `--quiet`, adds safe command/session/repository/contract diagnostics with `--verbose`, and emits color only when color is enabled and stdout is a TTY. JSON output always prints one parseable object, never mixes human text into JSON, and does not emit terminal color codes.

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

| Command                   | Phase 2 behavior                                             |
| ------------------------- | ------------------------------------------------------------ |
| `board init`              | Placeholder. Later initializes `.board/repository.yaml`.     |
| `board start`             | Placeholder. Later starts local repo services/apps.          |
| `board status`            | Placeholder. Later reports repository readiness.             |
| `board doctor`            | Placeholder. Later diagnoses setup and runtime issues.       |
| `board explain`           | Placeholder. Later explains repository architecture/context. |
| `board task`              | Placeholder. Later assembles task-specific context.          |
| `board verify`            | Placeholder. Later runs selected verification checks.        |
| `board stop`              | Placeholder. Later stops local Board-managed processes.      |
| `board contract validate` | Implemented thin shell using the repository contract parser. |

Canonical contract validation command:

```bash
board --help
board --version
board --json --version
board contract validate .board/repository.yaml
board contract validate .board/repository.yaml --json
```

When no path is supplied, validation defaults to `.board/repository.yaml`.

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
