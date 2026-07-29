# @repo-knowledge/types

Shared TypeScript types for repository readiness concepts.

Phase 0 intentionally keeps this package minimal. Phase 1 will design the real `.board/repository.yaml` schema, runtime validators, migration strategy, and complete TypeScript contract types.

Current placeholder domains:

- agent run IDs, tool-call IDs, proposal IDs, and approval IDs.
- agent runs and tool calls.
- agent memory.
- approval records.
- policy decisions.
- repository contracts.
- scanner facts.
- evidence references.
- check results.
- MCP tool contracts.
- command results.
