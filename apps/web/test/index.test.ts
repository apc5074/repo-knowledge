import { describe, expect, it } from "vitest";

import { createWebAppShell, webPackage } from "../src/index.js";

describe("@repo-knowledge/web", () => {
  it("exports the web package identity", () => {
    expect(webPackage).toEqual({
      name: "@repo-knowledge/web",
      phase: "phase-0-placeholder"
    });
  });

  it("creates a placeholder shell without requiring an API", () => {
    expect(createWebAppShell()).toEqual({
      title: "Board",
      phase: "phase-0-placeholder",
      requiresApi: false,
      plannedViews: [
        "repository readiness status",
        "agent run history",
        "artifact proposals",
        "approval queue"
      ]
    });
  });
});
