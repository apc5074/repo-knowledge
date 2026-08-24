# Editing Policy

Use this when deciding whether a change belongs in this repo and where it should go.

## Default Approach

- Make the smallest correct change.
- Preserve package ownership.
- Keep public behavior and tests aligned.
- Prefer deleting stale paths over documenting them as future behavior.
- Do not change unrelated files just because they are nearby.

## Working Paths Only

- Do not add a CLI command unless it has a working handler and tests.
- Do not keep placeholder success output for commands users can run.
- If behavior is planned but not implemented, document it as planned outside the executable path.
- User-facing docs should clearly separate current behavior from future intent.

## Test Policy

- Put tests in the package that owns the behavior.
- Reuse package harnesses and fixtures first.
- Do not create random root-level test files, scratch scripts, or throwaway fixtures.
- New fixtures need a clear reason and should live under the relevant package test fixture directory.
- Do not snapshot large outputs unless that is the clearest contract.
- Prefer tests that assert behavior, package boundaries, and structured outputs.

## Workspace Imports

- Use package names for workspace imports, such as `@repo-knowledge/bootstrap-runtime`.
- Never import another package through `../dist` or `../../package/dist`.
- Keep `package.json` dependencies in sync with real source imports.
- Refresh `pnpm-lock.yaml` after dependency edge changes.

## Core Logic Ownership

- Contract parsing and validation belongs in `repository-contract`.
- Scanner facts and detectors belong in `scanner-core`.
- Public scanner API belongs in `scanner` and should delegate to `scanner-core`.
- Init proposal/write behavior belongs in `init-core`.
- Start/status/stop runtime behavior belongs in `bootstrap-runtime`.
- Verification selection/execution/history belongs in `verification-runtime`.
- CLI owns command registration, flags, context, output, and errors.

## Data And Evidence

- Scanner facts should be deterministic and evidence-backed.
- Contract examples must not include real secrets.
- Secret-like values should be placeholders, variable names, or safe examples.
- Structured JSON output is preferred for agent-facing behavior.
- Human output should be concise and understandable.

## Documentation

- Update the closest README for public API, command, or workflow changes.
- Keep docs short and operational.
- Remove stale phase or placeholder language when code becomes real.
- Do not add long roadmap sections unless the user asks for planning docs.

## Verification

- Run the smallest useful package checks while iterating.
- Run downstream checks when changing package exports or shared behavior.
- Run `pnpm format:check` before finishing.
- If full confidence is needed, run `pnpm verify`.
- If a command was not run, say so and explain why.

## Communication

- Start final summaries with the concrete result.
- Use simple technical language.
- Name the files changed when useful.
- Say what passed and what did not run.
- Avoid vague quality claims without concrete evidence.
