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
