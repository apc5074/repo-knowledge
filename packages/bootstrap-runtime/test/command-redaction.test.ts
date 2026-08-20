import { describe, expect, it } from "vitest";

import { createBoundedRuntimeExcerpt, redactRuntimeOutput } from "../src/index.js";

describe("runtime command output redaction", () => {
  it("redacts known environment values while keeping diagnostic context", () => {
    expect(
      redactRuntimeOutput({
        text: "connected to postgres://user:pass@localhost:5432/app after retry",
        environmentValues: {
          DATABASE_URL: "postgres://user:pass@localhost:5432/app"
        }
      })
    ).toBe("connected to [redacted] after retry");
  });

  it("redacts token-like strings and common secret key assignments", () => {
    const result = redactRuntimeOutput({
      text: [
        "OPENAI_API_KEY=sk-proj_abcdefghijklmnopqrstuvwxyz1234567890",
        "AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF",
        "normal=value"
      ].join("\n")
    });

    expect(result).toContain("OPENAI_API_KEY=[redacted]");
    expect(result).toContain("AWS_ACCESS_KEY_ID=[redacted]");
    expect(result).toContain("normal=value");
    expect(result).not.toContain("sk-proj_abcdefghijklmnopqrstuvwxyz1234567890");
    expect(result).not.toContain("AKIA1234567890ABCDEF");
  });

  it("redacts URLs with credentials", () => {
    expect(
      redactRuntimeOutput({
        text: "fetch https://aidan:secret-password@example.com/api failed"
      })
    ).toBe("fetch https://[redacted]:[redacted]@example.com/api failed");
  });

  it("returns bounded redacted excerpts", () => {
    const result = createBoundedRuntimeExcerpt({
      text: `prefix ${"x".repeat(40)} TOKEN=secret-value suffix`,
      additionalValues: ["secret-value"],
      maxBytes: 24
    });

    expect(result?.length).toBeLessThanOrEqual(24);
    expect(result).not.toContain("secret-value");
    expect(result).toContain("suffix");
  });
});
