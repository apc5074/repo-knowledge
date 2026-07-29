# @repo-knowledge/api

Phase 0 placeholder for Board's hosted API boundary.

This package currently exposes framework-neutral health metadata for tests. It does not start an HTTP server, connect to PostgreSQL, connect to Redis, use object storage, require authentication, or call external services in Phase 0.

Future hosted-control-plane responsibilities include:

- repository registration.
- GitHub installation state.
- repository facts and artifact metadata.
- agent run history.
- tool-call records.
- proposals and approval state.
- readiness checks.
- organization and repository policy.
- web app API surface.
