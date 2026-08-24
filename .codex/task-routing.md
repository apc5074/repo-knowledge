# Task Routing

Use this file to decide what to read before editing. Read the smallest useful set first, then expand only when needed.

## Always Read First

- `AGENTS.md`
- This file
- The closest package `README.md`
- The tests for the behavior being changed

## CLI

Read:

- `packages/cli/README.md`
- `packages/cli/src/app.ts`
- `packages/cli/src/commands/<command>.ts`
- `packages/cli/test/index.test.ts`
- More specific CLI tests when relevant

Rules:

- Do not add placeholder commands.
- CLI adapts flags, context, errors, and output.
- Business logic belongs in the owning package.

## Repository Contract

Read:

- `docs/repository-contract.md`
- `packages/repository-contract/README.md`
- `packages/repository-contract/src/schema.ts`
- `packages/repository-contract/src/validate.ts`
- `packages/repository-contract/examples/*`
- Relevant validation and fixture tests

Rules:

- Contract changes need schema, parser, examples, docs, and tests to stay aligned.
- Do not store real secret values in examples or fixtures.

## Scanner

Read:

- `packages/scanner-core/README.md`
- `packages/scanner-core/src/scanner.ts`
- Relevant detector files in `packages/scanner-core/src/*detector.ts`
- `packages/scanner-core/test/fixtures/repos/README.md`
- Relevant detector tests

Rules:

- Facts must be deterministic.
- Facts should include evidence.
- Add fixtures only when existing fixtures cannot clearly cover the behavior.
- Keep public `packages/scanner` as a facade over `scanner-core`.

## Init

Read:

- `packages/init-core/README.md`
- `packages/init-core/src/init.ts`
- `packages/init-core/src/proposal.ts`
- `packages/init-core/src/review.ts`
- `packages/init-core/src/scan-to-contract.ts`
- Relevant init-core tests

Rules:

- Init should propose reviewable contract changes.
- Avoid hidden writes.
- Keep artifact proposal behavior explicit.

## Bootstrap Runtime

Read:

- `docs/bootstrap-runtime.md`
- `packages/bootstrap-runtime/README.md`
- `packages/bootstrap-runtime/src/plan.ts`
- `packages/bootstrap-runtime/src/orchestrator.ts`
- `packages/bootstrap-runtime/src/state-store.ts`
- `packages/bootstrap-runtime/src/status.ts`
- `packages/bootstrap-runtime/src/stop.ts`
- Relevant runtime tests

Rules:

- Runtime state should be structured and inspectable.
- Commands should be redacted where needed.
- Start/status/stop behavior belongs here, not in CLI.

## Verification Runtime

Read:

- `packages/verification-runtime/README.md`
- `packages/verification-runtime/src/selector.ts`
- `packages/verification-runtime/src/orchestrator.ts`
- `packages/verification-runtime/src/history-store.ts`
- `packages/verification-runtime/src/reports.ts`
- `packages/verification-runtime/src/json-output.ts`
- Relevant verification-runtime tests

Rules:

- Selection must be explainable.
- Check execution should preserve structured output.
- History writes should be deterministic and easy to inspect.

## Cross-Package Changes

Read:

- Each touched package `package.json`
- Each touched package public `src/index.ts`
- `pnpm-lock.yaml` importer sections
- `turbo.json` if build/test ordering changes
- Direct package tests for every affected package

Rules:

- Update manifests when imports change.
- Keep public exports intentional.
- Do not rely on stale `dist` output.
