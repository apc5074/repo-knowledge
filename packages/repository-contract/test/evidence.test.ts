import { describe, expect, it } from "vitest";

import { evidenceSchema } from "../src/index.js";

describe("evidence schema", () => {
  it("accepts source-backed evidence with a file and line range", () => {
    expect(
      evidenceSchema.parse({
        kind: "source",
        source_path: "src/server.ts",
        line_start: 10,
        line_end: 20,
        detector: "typescript-entrypoint",
        confidence: "high",
        verification_status: "detected"
      })
    ).toEqual({
      kind: "source",
      source_path: "src/server.ts",
      line_start: 10,
      line_end: 20,
      detector: "typescript-entrypoint",
      confidence: "high",
      verification_status: "detected"
    });
  });

  it("accepts runtime evidence with a command", () => {
    expect(
      evidenceSchema.parse({
        kind: "runtime",
        command: "pnpm test",
        observed_at: "2026-07-28T12:00:00.000Z",
        verification_status: "runtime_verified"
      })
    ).toEqual({
      kind: "runtime",
      command: "pnpm test",
      observed_at: "2026-07-28T12:00:00.000Z",
      verification_status: "runtime_verified"
    });
  });

  it("represents model-inferred claims without treating them as verified", () => {
    expect(
      evidenceSchema.parse({
        kind: "model_inferred",
        confidence: "medium",
        notes: "Generated from repository README and package scripts."
      })
    ).toEqual({
      kind: "model_inferred",
      confidence: "medium",
      notes: "Generated from repository README and package scripts.",
      verification_status: "unverified"
    });
  });

  it("represents agent-proposed claims without treating them as approved", () => {
    expect(
      evidenceSchema.parse({
        kind: "agent_proposed",
        verification_status: "approval_required",
        notes: "Contract Agent proposed this application name."
      })
    ).toEqual({
      kind: "agent_proposed",
      verification_status: "approval_required",
      notes: "Contract Agent proposed this application name."
    });
  });

  it("requires source_path for file-backed evidence", () => {
    const result = evidenceSchema.safeParse({
      kind: "config"
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: ["source_path"],
        message: "source_path is required for config evidence"
      }
    ]);
  });

  it("requires command for runtime evidence", () => {
    const result = evidenceSchema.safeParse({
      kind: "runtime"
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: ["command"],
        message: "command is required for runtime evidence"
      }
    ]);
  });

  it("rejects inverted line ranges", () => {
    const result = evidenceSchema.safeParse({
      kind: "source",
      source_path: "src/server.ts",
      line_start: 20,
      line_end: 10
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: ["line_end"],
        message: "line_end must be greater than or equal to line_start"
      }
    ]);
  });
});
