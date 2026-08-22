import { describe, expect, it } from "vitest";

import { verificationRuntimeBehavior, verificationRuntimePackage } from "../src/index.js";

describe("@repo-knowledge/verification-runtime", () => {
  it("exports package identity and basic behavior flags", () => {
    expect(verificationRuntimePackage).toMatchObject({
      name: "@repo-knowledge/verification-runtime",
      owns: "local-verification-runtime"
    });
    expect(verificationRuntimeBehavior).toMatchObject({
      defaultRunsChangedChecks: true,
      supportsDryRun: true,
      supportsJsonOutput: true
    });
  });
});
