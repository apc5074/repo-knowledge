import { describe, expect, it } from "vitest";

import {
  createBoundedDoctorLogText,
  createRedactedLogEvidence,
  redactDoctorLog
} from "../src/index.js";

describe("doctor log redaction", () => {
  it("redacts known environment values and token-like secrets", () => {
    const excerpt = redactDoctorLog({
      text: [
        "DATABASE_URL=postgres://user:pass@localhost:5432/app",
        "OPENAI_API_KEY=sk-proj_abcdefghijklmnopqrstuvwxyz1234567890"
      ].join("\n"),
      environmentValues: {
        DATABASE_URL: "postgres://user:pass@localhost:5432/app"
      }
    });

    expect(excerpt).toMatchObject({
      redacted: true,
      truncated: false
    });
    expect(excerpt?.text).toContain("DATABASE_URL=[redacted]");
    expect(excerpt?.text).toContain("OPENAI_API_KEY=[redacted]");
    expect(excerpt?.text).not.toContain("postgres://user:pass");
    expect(excerpt?.text).not.toContain("sk-proj_abcdefghijklmnopqrstuvwxyz1234567890");
  });

  it("bounds large logs and marks truncation", () => {
    const excerpt = redactDoctorLog({
      text: `prefix ${"x".repeat(80)} secret-value suffix`,
      additionalValues: ["secret-value"],
      maxCharacters: 30
    });

    expect(excerpt).toMatchObject({
      redacted: true,
      truncated: true,
      maxCharacters: 30,
      originalCharacters: 107
    });
    expect(excerpt?.text.length).toBeLessThanOrEqual(30);
    expect(excerpt?.text).toContain("suffix");
    expect(excerpt?.text).not.toContain("secret-value");
  });

  it("creates log evidence that is safe for persistence", () => {
    const evidence = createRedactedLogEvidence({
      summary: "Docker log excerpt",
      source: "docker",
      text: "TOKEN=secret-value failed",
      additionalValues: ["secret-value"]
    });

    expect(evidence).toEqual({
      kind: "log_excerpt",
      summary: "Docker log excerpt",
      source: "docker",
      excerpt: expect.objectContaining({
        text: "TOKEN=[redacted] failed",
        redacted: true
      })
    });
  });

  it("can return a bounded redacted text excerpt for report formatting", () => {
    expect(
      createBoundedDoctorLogText({
        text: "https://user:password@example.com failed",
        maxCharacters: 100
      })
    ).toBe("https://[redacted]:[redacted]@example.com failed");
  });
});
