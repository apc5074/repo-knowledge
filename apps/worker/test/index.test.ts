import { describe, expect, it } from "vitest";

import { bootWorker, workerPackage } from "../src/index.js";

describe("@repo-knowledge/worker", () => {
  it("exports the worker package identity", () => {
    expect(workerPackage).toEqual({
      name: "@repo-knowledge/worker",
      phase: "phase-0-placeholder"
    });
  });

  it("boots as a no-op placeholder without starting external services", () => {
    expect(bootWorker()).toEqual({
      name: "@repo-knowledge/worker",
      phase: "phase-0-placeholder",
      started: false,
      responsibilities: [
        "hosted indexing jobs",
        "readiness checks",
        "GitHub webhook follow-up work",
        "agent maintenance job dispatch"
      ]
    });
  });
});
