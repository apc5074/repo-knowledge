import { describe, expect, it } from "vitest";

import {
  createEvidenceFromLocation,
  createSafeExcerpt,
  findConfigKeyLocation,
  findRegexLocation,
  findStringLocation
} from "../src/index.js";

describe("source location helpers", () => {
  it("finds config keys in JSON, YAML, and TOML-like text", () => {
    expect(
      findConfigKeyLocation('{\n  "packageManager": "pnpm@10.0.0"\n}\n', "packageManager")
    ).toEqual({
      line_start: 2,
      line_end: 2,
      excerpt: '"packageManager": "pnpm@10.0.0"'
    });
    expect(
      findConfigKeyLocation("services:\n  api:\n    image: postgres\n", "image")
    ).toMatchObject({
      line_start: 3
    });
    expect(findConfigKeyLocation('[tool.poetry]\nname = "app"\n', "name")).toMatchObject({
      line_start: 2
    });
  });

  it("finds string and regex line locations", () => {
    const text = "first\nsecond value\nthird\n";

    expect(findStringLocation(text, "second")).toMatchObject({
      line_start: 2,
      excerpt: "second value"
    });
    expect(findRegexLocation(text, /third/)).toMatchObject({
      line_start: 3,
      excerpt: "third"
    });
  });

  it("keeps excerpts short and allows evidence without a location", () => {
    expect(createSafeExcerpt("x".repeat(140))).toHaveLength(120);
    expect(
      createEvidenceFromLocation({
        kind: "config",
        sourcePath: "package.json",
        detector: "package-manager"
      })
    ).toEqual({
      kind: "config",
      source_path: "package.json",
      detector: "package-manager"
    });
  });
});
