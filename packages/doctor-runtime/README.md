# @repo-knowledge/doctor-runtime

This package owns deterministic local diagnostics for `board doctor`, local known-problem matching, and local legacy candidate review records.

## Behavior

`board doctor` should load the repository contract, inspect local machine and Board state, run deterministic diagnostic rules, match known local problems, write a local diagnostic run record, and return a concise report. It should complete with exit code `0` when it can produce a partial or complete diagnostic report, even when it finds actionable problems.

Supported doctor options for this phase:

- `--json`: return the same facts in the shared machine-readable command result shape.
- `--category <category>`: limit diagnostics to `environment`, `runtime`, `docker`, `ports`, `verification`, `contract`, `docs`, or `legacy`.
- `--since <duration-or-run-id>`: limit history-aware checks to recent records or one run lineage.
- `--include-logs`: include bounded, redacted excerpts from relevant Board/runtime/docker logs.
- `--no-runtime`: skip Board runtime session inspection.
- `--no-docker`: skip Docker and Compose inspection.
- `--no-history`: skip previous doctor, runtime, and verification records.
- `--dry-run`: show which sources and diagnostic rules would run without recording a new diagnosis.

`board legacy list`, `board legacy explain`, and `board legacy review` operate on local legacy/deprecation candidates only. Candidate review changes local review state; it must not edit source files, docs, issues, pull requests, or repository contracts.

Known-problem statuses:

- `observed`: detected from a local diagnostic run.
- `matched`: a new finding matched an existing known local problem.
- `acknowledged`: a human or future agent has accepted that the problem is known.
- `resolved`: a later run or review verified the problem no longer reproduces.
- `ignored`: the user chose not to act on this local signal.

Legacy candidate review statuses:

- `unreviewed`: detected but not evaluated.
- `accepted`: valid cleanup candidate.
- `rejected`: false positive or intentionally retained.
- `needs-info`: more evidence is required.
- `resolved`: candidate no longer appears or has been cleaned up outside Board.

Findings are diagnoses when they describe direct local facts or deterministic contract/runtime mismatches. Findings are review candidates when they infer stale, legacy, deprecated, or obsolete workflows that need human confirmation.

## Boundaries

This phase does not run LLMs, call hosted APIs, create branches, open issues, create pull requests, modify source code, rewrite contracts, or perform autonomous cleanup.

Doctor runtime owns:

- diagnostic source and rule coordination.
- finding, known-problem, and legacy-candidate models.
- local diagnostic history and review record shapes.
- redacted report and JSON-ready output models.
- future Known Problem Agent and Legacy Agent tool boundaries.

Doctor runtime does not own:

- CLI argument parsing.
- repository contract schema validation.
- scanner fact collection internals.
- bootstrap runtime execution.
- verification command execution.
- MCP serving or hosted synchronization.

## Developer Workflow

Use `board doctor` when a local repository is not starting, verification is failing, Docker or ports look stale, or contract/docs references may no longer match the workspace. The command reads local files and Board state, runs deterministic inspectors, writes a local doctor run when state is enabled, and prints a concise report. Problems found by doctor are actionable local diagnostics; a successful command exit means the report was produced, not that the repository has no issues.

Common examples:

```sh
board doctor
board doctor --json
board doctor --category runtime
board doctor --category verification --dry-run
board doctor --include-logs
```

Diagnostic categories:

- `environment`: local tools, environment variables, and expected files.
- `runtime`: Board runtime sessions, failed steps, command results, and health checks.
- `docker`: Docker/Compose availability and container observations.
- `ports`: expected application ports, stale Board-owned ports, and duplicate contract ports.
- `verification`: recent verification history and stale verification configuration.
- `contract`: missing, invalid, or stale repository contract references.
- `docs`: documentation references to missing paths or commands.
- `legacy`: stale workflow and scanner-derived legacy/deprecation candidates.

`--dry-run` previews diagnostic sources without recording a new diagnosis. `--include-logs` may include bounded log excerpts, but excerpts are redacted before they are stored or returned. Secrets, tokens, credentials, and long unbounded output should not appear in reports; callers should still treat local diagnostic records as developer-machine state.

## Known Problems

Known-problem records are local summaries of repeated or reviewable findings. A doctor run fingerprints each finding, matches it to prior local records when possible, updates occurrence metadata, and includes matched record ids in the report. Verified resolution records are separate evidence that a known problem no longer reproduces, such as a later successful command or direct counter-evidence.

Known-problem records and resolutions are local state. They are not hosted issues, PR comments, graph facts, or source changes. Review status is a local signal for developers and future agent workflows.

## Legacy Candidate Review

Use `board legacy` commands to inspect local legacy/deprecation candidates detected from scanner facts and stale workflow references:

```sh
board legacy list
board legacy explain <candidate-id>
board legacy review <candidate-id> --status accepted --note "Confirmed replacement exists"
board legacy review <candidate-id> --status false-positive --note "Compatibility path is supported"
```

Candidate statuses describe review state only. A candidate can be an accepted cleanup target, a false positive, unresolved, or already resolved, but it is never a safe-delete instruction by itself. Confirm callers, contracts, documentation, and runtime behavior before removing code or workflows.

Legacy review records preserve counter-evidence, replacement hints, scanner fact ids, and reviewer notes. Rediscovery should update evidence without discarding prior human false-positive decisions.

## Agent Tool Surface

`runDoctorAgentTool` exposes the same deterministic doctor run as a structured, JSON-compatible record for future agent workflows. It accepts a repository root and diagnostic options, supports category filtering and dry-run mode, and returns findings, summaries, state paths, known problems, resolutions, and next steps without printing terminal output.
