import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  bootstrapRuntimePackage,
  buildBootstrapPlan,
  createJsonRuntimeStateStore,
  getRuntimeStatus,
  resolveRuntimeStateStorePaths,
  runtimeCommands,
  runtimeStatuses,
  stopRuntime
} from "../src/index.js";

describe("@repo-knowledge/bootstrap-runtime", () => {
  it("exports package identity and stable command names", () => {
    expect(bootstrapRuntimePackage).toMatchObject({
      name: "@repo-knowledge/bootstrap-runtime",
      owns: "local-bootstrap-runtime",
      phase: "phase-5-bootstrap-runtime",
      status: "implemented"
    });
    expect(runtimeCommands).toEqual(["start", "status", "stop"]);
    expect(runtimeStatuses).toEqual([
      "pending",
      "running",
      "succeeded",
      "failed",
      "interrupted",
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

  it("exposes status and stop through structured reports", async () => {
    const repositoryRoot = await tempRoot();
    const stateStore = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await tempRoot()
      })
    );

    await expect(
      getRuntimeStatus({ repositoryRoot, sessionId: "session-1", stateStore })
    ).resolves.toMatchObject({
      ok: false,
      status: "unknown",
      resources: []
    });
    await expect(stopRuntime({ repositoryRoot, stateStore })).resolves.toMatchObject({
      ok: false,
      status: "unknown",
      stoppedSessionIds: [],
      stoppedResources: []
    });
  });
});

async function tempRoot(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), "board-runtime-index-")));
}
