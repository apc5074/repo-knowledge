import { describe, expect, it } from "vitest";

import { apiPackage, getApiHealth } from "../src/index.js";

describe("@repo-knowledge/api", () => {
  it("exports the API package identity", () => {
    expect(apiPackage).toEqual({
      name: "@repo-knowledge/api",
      phase: "phase-0-placeholder"
    });
  });

  it("returns framework-neutral health metadata without external dependencies", () => {
    expect(getApiHealth()).toEqual({
      status: "ok",
      service: "@repo-knowledge/api",
      phase: "phase-0-placeholder",
      dependencies: {
        postgres: "not-required",
        redis: "not-required",
        objectStorage: "not-required"
      }
    });
  });
});
