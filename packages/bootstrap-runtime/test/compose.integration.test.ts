import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createComposeProjectName,
  inspectComposeStatus,
  startComposeServices,
  stopComposeProject
} from "../src/index.js";
import { copyFixtureRepository } from "./fixtures.js";

const dockerComposeIntegrationEnabled = process.env.BOARD_DOCKER_COMPOSE_TESTS === "1";
const dockerComposeAvailable =
  dockerComposeIntegrationEnabled &&
  spawnSync("docker", ["compose", "version"], {
    stdio: "ignore"
  }).status === 0;
const describeDockerCompose = dockerComposeAvailable ? describe : describe.skip;

describe("optional Docker Compose integration gate", () => {
  it("is skipped unless explicitly enabled and Docker Compose is available", () => {
    expect(typeof dockerComposeAvailable).toBe("boolean");
  });
});

describeDockerCompose("optional Docker Compose integration", () => {
  it("starts, inspects, stops, and removes a real compose service", async () => {
    const repositoryRoot = await copyFixtureRepository("compose-dependency");
    const composeFiles = [join(repositoryRoot, "compose.yaml")];
    const projectName = createComposeProjectName({
      repositoryRoot,
      sessionId: `docker-${randomUUID()}`
    });

    try {
      await expect(
        startComposeServices({
          repositoryRoot,
          projectName,
          composeFiles,
          services: ["postgres"]
        })
      ).resolves.toMatchObject({
        status: "succeeded"
      });

      await expect(
        inspectComposeStatus({
          repositoryRoot,
          projectName,
          composeFiles
        })
      ).resolves.toMatchObject({
        commandResult: {
          status: "succeeded"
        },
        statuses: expect.arrayContaining([
          expect.objectContaining({
            service: "postgres",
            status: expect.stringMatching(/running|pending/)
          })
        ])
      });

      await expect(
        stopComposeProject({
          repositoryRoot,
          projectName,
          composeFiles
        })
      ).resolves.toMatchObject({
        status: "succeeded"
      });
    } finally {
      await stopComposeProject({
        repositoryRoot,
        projectName,
        composeFiles,
        down: true
      });
    }
  });

  it("reports a missing compose service as a failed startup", async () => {
    const repositoryRoot = await copyFixtureRepository("compose-dependency");
    const composeFiles = [join(repositoryRoot, "compose.yaml")];
    const projectName = createComposeProjectName({
      repositoryRoot,
      sessionId: `docker-missing-${randomUUID()}`
    });

    try {
      await expect(
        startComposeServices({
          repositoryRoot,
          projectName,
          composeFiles,
          services: ["missing-service"]
        })
      ).resolves.toMatchObject({
        status: "failed"
      });
    } finally {
      await stopComposeProject({
        repositoryRoot,
        projectName,
        composeFiles,
        down: true
      });
    }
  });
});
