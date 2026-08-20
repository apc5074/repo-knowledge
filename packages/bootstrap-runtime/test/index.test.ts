import { describe, expect, it } from "vitest";

import {
  bootstrapRuntimePackage,
  buildBootstrapPlan,
  getRuntimeStatus,
  runtimeCommands,
  runtimeStatuses,
  startRuntime,
  stopRuntime
} from "../src/index.js";

describe("@repo-knowledge/bootstrap-runtime", () => {
  it("exports package identity and stable command names", () => {
    expect(bootstrapRuntimePackage).toMatchObject({
      name: "@repo-knowledge/bootstrap-runtime",
      owns: "local-bootstrap-runtime"
    });
    expect(runtimeCommands).toEqual(["start", "status", "stop"]);
    expect(runtimeStatuses).toEqual([
      "pending",
      "running",
      "succeeded",
      "failed",
      "skipped",
      "timed_out",
      "stopped",
      "unknown"
    ]);
  });

  it("builds a typed placeholder plan without CLI dependencies", () => {
    const result = buildBootstrapPlan({
      repositoryRoot: "/repo",
      contractPath: "/repo/.board/repository.yaml"
    });

    expect(result).toMatchObject({
      ok: true,
      status: "pending",
      plan: {
        repositoryRoot: "/repo",
        contractPath: "/repo/.board/repository.yaml",
        dryRun: true,
        resources: []
      }
    });
    expect(result.plan.steps.map((step) => step.id)).toEqual([
      "load-contract",
      "inspect-prerequisites",
      "resolve-environment",
      "record-state"
    ]);
  });

  it("exposes start, status, and stop placeholders through structured reports", () => {
    expect(startRuntime({ repositoryRoot: "/repo" })).toMatchObject({
      ok: true,
      status: "pending",
      plan: {
        repositoryRoot: "/repo"
      }
    });
    expect(getRuntimeStatus({ repositoryRoot: "/repo", sessionId: "session-1" })).toMatchObject({
      ok: true,
      status: "unknown",
      resources: [],
      session: {
        id: "session-1",
        repositoryRoot: "/repo",
        status: "unknown",
        resources: []
      }
    });
    expect(stopRuntime({ repositoryRoot: "/repo" })).toMatchObject({
      ok: true,
      status: "unknown",
      stoppedSessionIds: [],
      stoppedResources: []
    });
  });
});
