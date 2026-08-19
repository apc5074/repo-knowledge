# Dirty Worktree Fixture

This fixture contains an existing `.board/repository.yaml` target that can be copied into a temporary Git repository during tests.

Do not store a nested `.git/` directory in this fixture. Tests that need Git status should create a temporary repository, copy this fixture content, initialize Git state there, and then modify `.board/repository.yaml`.
