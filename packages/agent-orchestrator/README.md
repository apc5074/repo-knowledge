# Agent Orchestrator

Phase 0 placeholder for Board's internal maintenance-agent orchestration package.

## Future Ownership

This package will eventually own:

- Agent run lifecycle state
- Workflow routing
- Maintenance-agent state transitions
- LangGraph workflow integration boundaries
- Agent run audit metadata

## Non-Goals

This package must not directly execute shell commands, write repository files, call model providers, or bypass policy checks. Agents should operate through explicit tools owned by `@repo-knowledge/agent-tools`.
