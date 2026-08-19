# @repo-knowledge/init-core

Core initialization package for the Phase 4 `board init` workflow.

This package owns initialization logic that should be callable from the CLI, tests, and future Contract Agent orchestration without depending on CLI parsing or printing.

Phase 4 boundaries:

- depends on deterministic scanner output
- depends on repository-contract validation and serialization
- returns JSON-safe proposal/result data
- does not print to stdout or stderr
- does not call LLMs, hosted APIs, MCP servers, or bootstrap runtimes
- does not write files until later safe-write tickets implement artifact application

The package exposes:

- `initializeRepository()` for scanner-backed initialization workflows.
- `buildInitializeRepositoryResult()` and `summarizeInitializeRepositoryResult()` for JSON-safe result construction and human summaries from the same data.
- `mapScannerFactsToRepositorySection()` for conservative scanner-to-contract repository section mapping.
- `mapScannerFactsToApplications()` for converting scanner application candidates into contract `applications`.
- `mapScannerFactsToServices()` for converting Compose-defined services into contract `services`.
- `mapScannerFactsToSetup()` for mapping setup-oriented command facts into contract `setup`.
- `mapScannerFactsToVerification()` for mapping validation command facts into contract `verification.default`.
- `mapScannerFactsToEnvironment()` for converting env-name facts into secret-safe contract `environment`.
- `mapScannerFactsToPathRules()` for converting generated path facts and sensitive env examples into path rules.
- `mapScannerFactsToRelationships()` for conservative related repository and external system mapping.
- `mapScannerFactsToKnownLimitations()` for deterministic local setup limitations.
- `mergeRepositoryContracts()` for preserving maintainer-authored contract data while adding generated findings.
- `buildContractProposal()` for producing a validated generated or merged contract proposal without writing files.
- `serializeContractForInit()` for stable YAML serialization plus parse-back validation.
- `buildInitArtifactProposals()` for JSON-safe init artifact proposals.
- `buildArtifactDiff()` and `attachArtifactDiffs()` for deterministic artifact diffs.
- `writeArtifactProposals()` for safe artifact writes once write mode is enabled.
- `getWorktreeStatus()` for Git-aware dirty worktree and target-file checks.
- `detectMissingDevelopmentScripts()` for readiness script gap reporting.
- `generateScriptProposals()` for reviewable missing-script suggestions.
- `generateLocalDevelopmentAssumptions()` for initial local setup assumptions.

Repository-section mapping currently derives repository name, type, primary language, and language list from deterministic scanner facts. It prefers root package/project metadata for names, treats TypeScript as the primary language when both TypeScript and JavaScript are detected, marks workspace roots as monorepos, and leaves unsupported or ambiguous fields as review items.

Application mapping uses scanner application candidates, stable human-readable IDs, command facts, entrypoint facts, ports where visible from command text, and scanner evidence. Low-confidence candidates become review items instead of contract applications.

Service mapping only creates contract services from Compose service facts. Code-only PostgreSQL, Redis, or database dependency findings become review items because Phase 4 should not invent local containers when no local service definition exists.

Setup mapping selects high-confidence install/bootstrap/setup, migration, seed, generate, health-check, smoke-check, and Compose runtime commands. Alternatives are surfaced as review items instead of being hidden.

Verification mapping selects and deduplicates test, lint, typecheck, and build commands into default verification checks. Local script and task-file commands outrank CI-derived commands, while alternatives remain review items.

Environment mapping records variable names, required/secret flags, evidence, and used-by references where scanner facts support them. It never writes real `.env` values or concrete secret defaults.

Path mapping represents generated files, sensitive env-file patterns, and unsafe-to-edit generated outputs. Generated lockfiles are represented as managed files but are not marked as unsafe edit paths.

Relationship mapping only creates related repositories from explicit URL/slug metadata and external systems from explicit external API endpoint variables. Local workspace package boundaries become review items rather than cross-repository entries.

Known limitation mapping records deterministic setup caveats such as code-only service dependencies, detected seed data without seed commands, and services without detected health checks.

Merge behavior preserves existing repository purpose, owners, descriptions, metadata, and matching section entries. When generated and existing values disagree, the existing value is kept and a review item records the conflict.

Proposal building validates the generated or merged contract and returns JSON-safe proposal metadata. It does not write files; artifact proposals, diffs, script proposals, and safe artifact writing are implemented by later Phase 4 tickets.

Init serialization delegates to the Phase 1 contract serializer, then parses and validates the YAML again so generated `.board/repository.yaml` content is stable enough for Git review.

Artifact proposals make proposed writes explicit for `.board/` and `.board/repository.yaml`, while deferring `AGENTS.md`, docs, and repo-local skills to later phases. Artifact proposals do not write files.

When an existing `.board/repository.yaml` cannot be parsed or validated, init treats it as a conflict. It does not overwrite that source contract by default. Instead, it skips the original target and proposes `.board/repository.generated.yaml` as a sidecar draft so maintainers and future agents can review a fresh generated contract before repairing or replacing the invalid file.

Diff generation attaches unified text diffs to create/update artifact proposals so dry-run and JSON output can show reviewable file changes without touching disk.

Dry-run mode scans, builds, validates, serializes, diffs, and reports artifact proposals without writing files.

Write mode is only entered through explicit `mode: "write"` and applies validated artifact proposals through the safe writer. Safe writing creates directories recursively, writes file artifacts through a temporary file followed by rename, refuses unsafe create/update conflicts by default, and skips deferred, unchanged, and explicit skip artifacts.

Worktree safety records whether the repository is Git-backed, reports modified and untracked files, and blocks write mode from touching dirty target files unless force is explicitly set. Non-Git repositories can still initialize with a warning.

Missing script detection compares scanner command facts against expected readiness capabilities. Gaps are emitted as review items and recommendations only; they are not treated as verified commands.

Script proposals describe where a missing readiness command could live and, only when evidence is strong enough, a suggested command body. They never edit manifests or scripts.

Local development assumptions summarize evidence-backed expectations such as package manager, service names, setup commands, and ports. They stay separate from verified contract facts and remain reviewable result metadata.

Init fixtures live under `test/fixtures/repos` for init-specific states such as existing valid contracts, existing invalid contracts, missing scripts, dirty target contracts, and non-Git repositories. Scanner fixture repositories remain the source of reusable TypeScript, Python, monorepo, API plus worker, and frontend plus API shapes.
