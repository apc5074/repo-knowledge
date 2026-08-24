import { describe, expect, it } from "vitest";

import { runDoctorAgentTool } from "../src/index.js";
import { copyDoctorFixtureRepository, seedFailedRuntimeState } from "./fixtures.js";

describe("doctor agent tool surface", () => {
  it("returns a serializable doctor run record without CLI formatting", async () => {
    const fixture = await copyDoctorFixtureRepository("doctor-all-categories");
    await seedFailedRuntimeState(fixture.stateRoot);

    const record = await runDoctorAgentTool({
      repositoryRoot: fixture.root,
      contractPath: fixture.contractPath,
      repositoryStateRoot: fixture.stateRoot,
      categories: ["runtime"],
      disabledInspectors: ["docker", "ports", "verification"],
      env: {
        PATH: process.env.PATH
      },
      runId: "agent-tool-runtime"
    });

    expect(record.tool_name).toBe("doctor");
    expect(record.schema_version).toBe(1);
    expect(record.run_id).toBe("agent-tool-runtime");
    expect(record.repository_root).toBe(fixture.root);
    expect(record.categories).toEqual(["runtime"]);
    expect(record.findings.every((finding) => finding.category === "runtime")).toBe(true);
    expect(record.enabled_inspectors).not.toContain("docker");
    expect(record.skipped_inspectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "docker",
          reason: "disabled"
        })
      ])
    );
    expect(record.state_paths.run).toContain("agent-tool-runtime.json");
    expect(JSON.parse(JSON.stringify(record))).toMatchObject({
      tool_name: "doctor",
      ok: true,
      run_id: "agent-tool-runtime"
    });
  });

  it("reports dry-run inspector skips in the structured record", async () => {
    const fixture = await copyDoctorFixtureRepository("doctor-all-categories");

    const record = await runDoctorAgentTool({
      repositoryRoot: fixture.root,
      contractPath: fixture.contractPath,
      repositoryStateRoot: fixture.stateRoot,
      dryRun: true,
      runId: "agent-tool-dry-run"
    });

    expect(record.findings).toEqual([]);
    expect(record.skipped_inspectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "local-environment",
          reason: "dry-run"
        })
      ])
    );
  });
});
