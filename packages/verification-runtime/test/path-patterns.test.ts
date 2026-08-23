import { describe, expect, it } from "vitest";

import { matchesPathPattern, normalizeRepositoryPath } from "../src/index.js";

describe("@repo-knowledge/verification-runtime path patterns", () => {
  it("normalizes repository-relative paths", () => {
    expect(normalizeRepositoryPath({ repositoryRoot: "/repo", path: "src/../src/app.ts" })).toBe(
      "src/app.ts"
    );
  });

  it("matches basic glob patterns", () => {
    expect(matchesPathPattern("src/**", "src/app/server.ts")).toBe(true);
    expect(matchesPathPattern("src/*.ts", "src/app.ts")).toBe(true);
    expect(matchesPathPattern("src/*.ts", "src/app/test.ts")).toBe(false);
  });

  it("matches cross-platform path separators", () => {
    expect(matchesPathPattern("src\\**", "src/app/server.ts")).toBe(true);
    expect(matchesPathPattern("src/**", "src\\app\\server.ts")).toBe(true);
  });

  it("rejects repository paths outside the root", () => {
    expect(() =>
      normalizeRepositoryPath({ repositoryRoot: "/repo", path: "../secret.txt" })
    ).toThrow("repository root");
    expect(() =>
      normalizeRepositoryPath({ repositoryRoot: "/repo", path: "/repo/src/app.ts" })
    ).toThrow("relative");
  });
});
