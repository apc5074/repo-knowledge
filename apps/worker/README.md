# Worker

Phase 0 placeholder for Board's hosted worker application.

## Future Ownership

This app will eventually own asynchronous hosted work:

- Repository indexing jobs
- Pull request readiness checks
- GitHub webhook follow-up work
- Agent maintenance job dispatch
- Artifact proposal processing
- Known-problem background analysis

## Phase 0 Boundary

The worker currently exports package identity and a no-op `bootWorker()` function.

It must not connect to PostgreSQL, Redis, queues, GitHub, LangGraph, Celery, or external services in Phase 0.
