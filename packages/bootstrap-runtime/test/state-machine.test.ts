import { describe, expect, it } from "vitest";

import {
  canTransitionRuntimeStatus,
  createRuntimeStep,
  summarizeSessionStatus,
  transitionRuntimeStatus,
  updateRuntimeStepStatus,
  type BootstrapSession
} from "../src/index.js";

describe("runtime state machine", () => {
  it("allows expected runtime transitions and rejects invalid ones", () => {
    expect(canTransitionRuntimeStatus("pending", "running")).toBe(true);
    expect(canTransitionRuntimeStatus("running", "succeeded")).toBe(true);
    expect(canTransitionRuntimeStatus("running", "timed_out")).toBe(true);
    expect(canTransitionRuntimeStatus("timed_out", "stopped")).toBe(true);
    expect(canTransitionRuntimeStatus("succeeded", "running")).toBe(false);
    expect(transitionRuntimeStatus("succeeded", "running")).toEqual({
      ok: false,
      from: "succeeded",
      to: "running",
      reason: "Invalid runtime status transition from succeeded to running."
    });
  });

  it("updates step timestamps through valid transitions", () => {
    const pending = createRuntimeStep("install", "setup", "Install dependencies");
    const running = updateRuntimeStepStatus(pending, "running", "2026-01-01T00:00:00.000Z");
    const succeeded = updateRuntimeStepStatus(running, "succeeded", "2026-01-01T00:00:03.000Z");

    expect(running).toMatchObject({
      status: "running",
      startedAt: "2026-01-01T00:00:00.000Z"
    });
    expect(succeeded).toMatchObject({
      status: "succeeded",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:03.000Z"
    });
    expect(() => updateRuntimeStepStatus(succeeded, "running")).toThrow(
      "Invalid runtime status transition"
    );
  });

  it("summarizes partial session states for status output", () => {
    expect(
      summarizeSessionStatus(
        session([
          updateRuntimeStepStatus(createRuntimeStep("install", "setup", "Install"), "succeeded"),
          updateRuntimeStepStatus(
            createRuntimeStep("start-api", "application", "Start API"),
            "running"
          )
        ])
      )
    ).toBe("running");
    expect(
      summarizeSessionStatus(
        session([
          updateRuntimeStepStatus(createRuntimeStep("install", "setup", "Install"), "succeeded"),
          updateRuntimeStepStatus(
            createRuntimeStep("start-api", "application", "Start API"),
            "failed"
          )
        ])
      )
    ).toBe("failed");
    expect(
      summarizeSessionStatus(
        session([
          updateRuntimeStepStatus(createRuntimeStep("install", "setup", "Install"), "succeeded"),
          updateRuntimeStepStatus(
            createRuntimeStep("health", "health-check", "Health check"),
            "timed_out"
          )
        ])
      )
    ).toBe("timed_out");
  });
});

function session(steps: BootstrapSession["steps"]): BootstrapSession {
  return {
    id: "session-1",
    repositoryRoot: "/repo",
    status: "running",
    steps,
    resources: [],
    commandResults: [],
    healthCheckResults: [],
    warnings: [],
    errors: []
  };
}
