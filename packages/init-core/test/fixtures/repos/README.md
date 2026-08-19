# Init Fixture Repositories

These fixtures exercise `board init` states that are either not covered by the scanner fixtures or need init-specific repository state.

Shared scanner shapes are still reusable from `packages/scanner-core/test/fixtures/repos`:

- TypeScript API new init: `typescript-api`
- Python API new init: `python-api`
- Monorepo new init: `monorepo`
- API plus worker: `api-plus-worker`
- Frontend plus API: `frontend-plus-api`
- Missing scripts: `invalid-config-repo`

Init-specific fixtures in this directory:

- `typescript-api-new`: minimal TypeScript API with no existing contract.
- `python-api-new`: minimal Python API with no existing contract.
- `monorepo-new`: minimal workspace monorepo with no existing contract.
- `api-plus-worker`: API and worker entrypoints in one package.
- `frontend-plus-api`: frontend plus API entrypoints.
- `existing-valid-contract`: existing valid `.board/repository.yaml`.
- `existing-invalid-contract`: existing invalid `.board/repository.yaml`.
- `missing-scripts`: package manifest without readiness scripts.
- `dirty-worktree`: includes an existing target contract for dirty target tests; tests should create temporary Git state around it.
- `non-git-repository`: no `.git/` directory for non-Git init behavior.

Fixtures are intentionally tiny and do not require dependency installation.
