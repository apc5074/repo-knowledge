# @repo-knowledge/repository-graph

This package owns the deterministic local repository-understanding graph for Board.

## Behavior

The repository graph should turn one repository into structured local knowledge that agents and developers can query without reading arbitrary file blobs first. It models repository entities, relationships, evidence, confidence, and freshness so later commands and agents can explain why a file, symbol, route, worker, command, generated artifact, known problem, or legacy candidate matters.

Supported graph entity kinds for this phase:

- `repository`
- `file`
- `directory`
- `package`
- `workspace`
- `component`
- `application`
- `service`
- `worker`
- `queue`
- `route`
- `symbol`
- `command`
- `script`
- `ci_job`
- `test`
- `database`
- `table`
- `migration`
- `generated_artifact`
- `document`
- `agent_instruction`
- `verification_check`
- `known_problem`
- `legacy_candidate`

Supported relationship kinds for this phase:

- `contains`
- `owns`
- `exports`
- `imports`
- `depends_on`
- `registers`
- `handles_route`
- `calls`
- `reads`
- `writes`
- `tests`
- `documents`
- `references`
- `runs`
- `verifies`
- `generates`
- `unsafe_to_edit`
- `replaced_by`
- `candidate_for`
- `has_usage_evidence`
- `has_counter_evidence`
- `matched_known_problem`

Confidence levels:

- `low`: weak but plausible deterministic evidence.
- `medium`: multiple supporting facts or one reliable parser-backed fact.
- `high`: strong deterministic evidence from contract, parser, or repeated local references.
- `confirmed`: direct source-of-truth evidence such as contract ownership or exact local state linkage.

Evidence requirements:

- Important nodes and edges should carry evidence that points back to files, source locations, scanner facts, contract entries, verification history, doctor records, or local graph metadata.
- Raw scanner facts, AST locations, verification history, doctor records, source fingerprints, build metadata, and invalidation metadata remain supporting evidence or state unless they represent a real repository entity.
- Parse failures, unresolved imports, or missing optional local state should produce warnings instead of fabricated graph records.

Query expectations:

- The graph should support node lookup, neighbor lookup, traversal, path finding, evidence retrieval, and relationship explanation through graph APIs rather than direct SQL.
- Query output should stay stable enough for future agent use and should prefer explicit uncertainty over aggressive inference.
- Related-target queries should be able to explain nearby files, tests, routes, commands, docs, checks, known problems, and legacy candidates.

Freshness and invalidation:

- Graph builds should record build metadata, input fingerprints, and invalidation state under local Board state.
- `--changed` rebuild behavior may fall back to full rebuild with a clear reason when invalidation is incomplete or uncertain.
- Missing optional history sources should not block graph construction.

## Boundaries

This phase does not run LLMs, call hosted APIs, create branches, open issues, create pull requests, modify source code, or mutate repository contracts. It does not replace scanner-core, repository-contract, verification-runtime, or doctor-runtime ownership.

Repository graph owns:

- graph schema and storage abstractions.
- graph build inputs, build metadata, and invalidation planning.
- graph-backed query and explanation surfaces.
- evidence-backed repository relationships for future context and cleanup agents.

Repository graph does not own:

- CLI argument parsing.
- scanner fact extraction internals.
- repository contract validation.
- verification execution.
- doctor execution or review state ownership.
- MCP serving or hosted synchronization.

## Developer Workflow

The package should eventually power local `board graph` commands and future agent tools with a graph-first view of repository context. Instead of asking an agent to infer meaning from raw files, callers should be able to ask:

- what imports this symbol?
- what files belong to this component?
- what route is handled here?
- what tests or docs mention this path?
- what command generates this file?
- what appears legacy, replaced, or unsafe to edit?

Legacy cleanup depends on this structure. A cleanup candidate should be backed by usage and counter-evidence such as callers, routes now handled elsewhere, replaced commands, stale docs, generated-file rules, verification checks, or known local problems.

## Current API Surface

The package exports the typed graph model and stores, plus:

- `loadGraphBuildContext`, which deterministically collects the contract, scanner result, tracked-file inventory and fingerprints, Git SHA, and optional local verification and doctor state. Missing optional state is reported as a warning rather than failing a graph build.
- `ingestRepositoryContract` and `ingestScannerFacts`, which convert supported contract records and scanner facts into evidence-backed graph records. Unsupported facts are intentionally skipped rather than inferred.
- `buildStructuralGraph`, which turns the scanner-filtered inventory into repository, directory, file, package, and workspace records with file fingerprints.
- `buildRuntimeUnitGraph`, which connects contract applications and services, plus scanner-detected applications and workers, to their supported files and commands.
- `indexTypeScriptSymbols` and `indexTypeScriptImports`, which use the TypeScript compiler parser for supported TS/JS files and preserve source locations, unresolved-import warnings, and conservative local/workspace relationships.
- `indexPythonSymbols` and `indexPythonImports`, which build on scanner-core Python source analysis and conservatively index direct function/class declarations plus resolvable absolute and relative local imports.
- `buildRouteIndex` and `buildRequestFlow`, which use scanner route facts as the source of truth, connect supported handlers and runtime units, and record only direct calls to locally imported targets.
- `buildWorkerFlow` and `buildDatabaseAccess`, which model scanner-detected worker queues and commands, database dependencies, migration/seed paths, and direct Prisma, SQLAlchemy, or simple SQL reads and writes.
- `buildTestRelations` and `buildGeneratedPathGraph`, which distinguish import-backed test links from filename-only links and model only scanner- or contract-supported generated/unsafe paths.
- `buildReferenceIndex` and `ingestDoctorRecords`, which index structured command, CI, verification, and document references alongside read-only snapshots of known problems and legacy candidates.
- `aggregateUsageEvidence` and `explainLegacyCandidate`, which keep each active-use signal separate and give conservative, auditable candidate explanations that never claim code is safe to delete.
- `planGraphInvalidation` and typed query helpers for related graph records, tests, docs, commands, unsafe paths, usage, and legacy candidates.
- `explainGraphTarget` and concise report formatters for graph builds, freshness, related records, and evidence-backed explanations.

Graph construction, structural file nodes, language indexes, queries, and explanations remain later Phase 8 work.
