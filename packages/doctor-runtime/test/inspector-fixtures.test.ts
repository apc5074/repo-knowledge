import { describe, expect, it } from "vitest";

import {
  createBoundedDoctorLogText,
  inspectDocker,
  inspectLocalEnvironment,
  inspectPorts,
  inspectRuntimeSessions,
  inspectVerificationHistory,
  loadDoctorRepositoryContext
} from "../src/index.js";
import {
  copyDoctorFixtureRepository,
  seedFailedRuntimeState,
  seedFailedVerificationHistory
} from "./fixtures.js";

describe("fixture-backed inspector safety", () => {
  it("collects inspector observations from fixture state and fake runners", async () => {
    const fixture = await copyDoctorFixtureRepository("doctor-all-categories");
    await seedFailedRuntimeState(fixture.stateRoot);
    await seedFailedVerificationHistory(fixture.stateRoot);
    const context = await loadDoctorRepositoryContext({
      repositoryRoot: fixture.root,
      contractPath: fixture.contractPath,
      runGitCommand: async () => ({
        exitCode: 0,
        stdout: fixture.root,
        stderr: ""
      })
    });
    const environment = await inspectLocalEnvironment({
      context,
      env: {},
      runVersionCommand: async (command, args) => ({
        exitCode: command === "node" ? 0 : 1,
        stdout: command === "node" ? "v22.0.0" : "",
        stderr: `${[command, ...args].join(" ")} missing`,
        timedOut: false
      }),
      fileExists: async (path) => path.endsWith("package.json")
    });
    const runtime = await inspectRuntimeSessions({ repositoryStateRoot: fixture.stateRoot });
    const verification = await inspectVerificationHistory({
      repositoryStateRoot: fixture.stateRoot
    });
    const docker = await inspectDocker({
      context,
      runDockerCommand: async (args) => ({
        exitCode: args.join(" ") === "--version" ? 0 : 1,
        stdout: args.join(" ") === "--version" ? "Docker version 28.0.0" : "",
        stderr: "fixture daemon unavailable",
        timedOut: false
      })
    });
    const ports = await inspectPorts({
      context,
      runtimeInspection: runtime,
      checkPort: async (port) => ({
        status: port.port === 3000 ? "occupied" : "closed"
      }),
      requireListening: true
    });

    expect(environment.environment).toContainEqual(
      expect.objectContaining({
        name: "DATABASE_URL",
        status: "missing"
      })
    );
    expect(runtime.observations.map((observation) => observation.kind)).toEqual(
      expect.arrayContaining(["failed_migration", "failed_seed", "failed_health_check"])
    );
    expect(verification.observations.map((observation) => observation.kind)).toEqual(
      expect.arrayContaining(["failed_check", "missing_configured_command", "repeated_failure"])
    );
    expect(docker.observations.map((observation) => observation.kind)).toEqual([
      "docker_daemon_unavailable",
      "compose_unavailable"
    ]);
    expect(ports.observations.map((observation) => observation.kind)).toEqual(
      expect.arrayContaining(["occupied_expected_port", "missing_expected_listener"])
    );
  });

  it("redacts fixture log text before it can be persisted", () => {
    const text = createBoundedDoctorLogText({
      text: "DATABASE_URL=postgres://user:password@localhost/app TOKEN=secret-fixture-value",
      additionalValues: ["secret-fixture-value"],
      maxCharacters: 200
    });

    expect(text).toContain("DATABASE_URL=postgres://[redacted]:[redacted]@localhost/app");
    expect(text).toContain("TOKEN=[redacted]");
    expect(text).not.toContain("password");
    expect(text).not.toContain("secret-fixture-value");
  });
});
