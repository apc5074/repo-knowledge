# Bootstrap Runtime Test Fixtures

These fixture repositories are committed test data for the local bootstrap runtime.

- `minimal-node-app`: Node setup command, long-running fake app process, and command health check.
- `python-health-app`: Python fake app and command health check.
- `api-worker`: separate API and worker process commands.
- `compose-dependency`: Compose-backed Postgres metadata plus install, migrate, seed, optional setup, app, and health commands.
- `failing-setup`: setup command that exits non-zero.
- `missing-env`: required secret environment variable without a local value.
- `invalid-runtime-fields`: invalid contract fields for validation tests.

Normal unit and CLI integration tests use local commands and do not require Docker or network access.

Optional Docker Compose integration coverage lives in `test/compose.integration.test.ts`. It is skipped unless both conditions are true:

- `BOARD_DOCKER_COMPOSE_TESTS=1`
- `docker compose version` succeeds

Run it manually with:

```bash
BOARD_DOCKER_COMPOSE_TESTS=1 pnpm --filter @repo-knowledge/bootstrap-runtime test -- --run test/compose.integration.test.ts
```

CI decision: these tests do not run in ordinary CI because they require a Docker daemon and may need local images. When enabled, each test uses a unique Compose project name and runs `docker compose down` in cleanup to avoid leaving containers behind.
