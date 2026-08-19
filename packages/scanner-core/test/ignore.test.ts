import { describe, expect, it } from "vitest";

import {
  classifyRepositoryFile,
  isSensitivePath,
  normalizeInventoryPath,
  shouldIgnoreRepositoryPath
} from "../src/index.js";

describe("ignore and safety rules", () => {
  it("normalizes inventory paths to repository-relative slash paths", () => {
    expect(normalizeInventoryPath(".\\src\\index.ts")).toBe("src/index.ts");
    expect(normalizeInventoryPath("./docs//guide.md")).toBe("docs/guide.md");
  });

  it("skips vendored, generated, cache, and git internals", () => {
    expect(shouldIgnoreRepositoryPath(".git/config")).toMatchObject({
      ignored: true
    });
    expect(shouldIgnoreRepositoryPath("node_modules/pkg/index.js")).toMatchObject({
      ignored: true
    });
    expect(shouldIgnoreRepositoryPath("coverage/lcov.info")).toMatchObject({
      ignored: true
    });
  });

  it("treats local env files as sensitive while allowing examples", () => {
    expect(isSensitivePath(".env")).toBe(true);
    expect(isSensitivePath(".env.local")).toBe(true);
    expect(isSensitivePath(".env.example")).toBe(false);
    expect(shouldIgnoreRepositoryPath(".env.local")).toMatchObject({
      ignored: true
    });
  });

  it("classifies files so detectors can choose relevant inputs", () => {
    expect(classifyRepositoryFile("src/index.ts")).toBe("code");
    expect(classifyRepositoryFile("package.json")).toBe("config");
    expect(classifyRepositoryFile("README.md")).toBe("documentation");
    expect(classifyRepositoryFile("docs/setup.md")).toBe("documentation");
    expect(classifyRepositoryFile("AGENTS.md")).toBe("agent-instruction");
    expect(classifyRepositoryFile("public/logo.png")).toBe("binary");
    expect(classifyRepositoryFile("notes.txt")).toBe("unknown");
  });
});
