# @repo-knowledge/mcp-server

Phase 0 placeholder for Board's local and hosted MCP interfaces.

This package currently exports stable metadata for the planned MCP tools. It does not start an MCP server, bind a transport, read repositories, run commands, or call the network in Phase 0.

Planned tools:

- `get_repository_overview`
- `get_component`
- `get_task_context`
- `find_relevant_files`
- `find_symbol`
- `trace_request`
- `trace_event`
- `find_similar_implementation`
- `get_build_instructions`
- `get_validation_requirements`
- `get_known_problem`
- `get_related_repositories`
- `get_change_impact`
- `start_development_environment`
- `diagnose_environment`
- `run_relevant_checks`

Phase 2 and later phases will add command framework integration, repository discovery, and actual MCP tool behavior.
