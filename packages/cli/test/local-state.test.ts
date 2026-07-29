import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  createRepositoryStateKey,
  ensureLocalStateDirectories,
  resolveLocalStatePaths
} from "../src/index.js";

describe("local state paths", () => {
  it("uses macOS application support and cache conventions", () => {
    const home = join(tmpdir(), `board-home-${randomUUID()}`);

    expect(
      resolveLocalStatePaths({
        env: {
          HOME: home
        },
        platform: "darwin"
      })
    ).toEqual({
      dataRoot: join(home, "Library/Application Support/board"),
      cacheRoot: join(home, "Library/Caches/board"),
      logsRoot: join(home, "Library/Application Support/board/logs"),
      sessionsRoot: join(home, "Library/Application Support/board/sessions"),
      repositoriesRoot: join(home, "Library/Application Support/board/repositories"),
      repositoryStateRoot: undefined,
      repositoryKey: undefined
    });
  });

  it("uses XDG directories on Linux when provided", () => {
    const dataHome = join(tmpdir(), `board-data-${randomUUID()}`);
    const cacheHome = join(tmpdir(), `board-cache-${randomUUID()}`);

    expect(
      resolveLocalStatePaths({
        env: {
          HOME: "/unused",
          XDG_DATA_HOME: dataHome,
          XDG_CACHE_HOME: cacheHome
        },
        platform: "linux"
      })
    ).toMatchObject({
      dataRoot: join(dataHome, "board"),
      cacheRoot: join(cacheHome, "board")
    });
  });

  it("creates deterministic repository-specific state keys", () => {
    const repositoryRoot = join(tmpdir(), "repo-knowledge");
    const first = createRepositoryStateKey(repositoryRoot);
    const second = createRepositoryStateKey(repositoryRoot);

    expect(first).toBe(second);
    expect(first).toHaveLength(24);
  });

  it("creates directories only when the ensure helper is called", async () => {
    const dataRoot = join(tmpdir(), `board-data-root-${randomUUID()}`);
    const cacheRoot = join(tmpdir(), `board-cache-root-${randomUUID()}`);
    const paths = resolveLocalStatePaths({
      env: {
        HOME: "/unused",
        BOARD_DATA_HOME: dataRoot,
        BOARD_CACHE_HOME: cacheRoot
      },
      platform: "linux",
      repositoryRoot: {
        ok: true,
        root: "/tmp/repo",
        foundBy: "git",
        startDirectory: "/tmp/repo"
      }
    });

    await expect(readdir(dataRoot)).rejects.toThrow();
    await ensureLocalStateDirectories(paths);

    await expect(readdir(dataRoot)).resolves.toEqual(
      expect.arrayContaining(["logs", "repositories", "sessions"])
    );
    await expect(readdir(cacheRoot)).resolves.toEqual([]);
    expect(paths.repositoryStateRoot).toBeDefined();
  });
});
