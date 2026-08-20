import { parseRepositoryContractFile } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import {
  buildBootstrapPlan,
  createJsonRuntimeStateStore,
  loadRuntimeContract,
  resolveRuntimeEnvironment,
  resolveRuntimeStateStorePaths,
  runSetupSteps,
  startRuntime
} from "../src/index.js";
import {
  bootstrapRuntimeFixtureRepos,
  copyFixtureRepository,
  createMockRuntimeCommandExecutor,
  fixtureRepositoryPath,
  listFixtureRepositories
} from "./fixtures.js";

const validFixtureRepos = bootstrapRuntimeFixtureRepos.filter(
  (name) => name !== "invalid-runtime-fields"
);

describe("bootstrap runtime fixture repositories", () => {
  it("contains the expected committed fixture repositories", async () => {
    await expect(listFixtureRepositories()).resolves.toEqual([...bootstrapRuntimeFixtureRepos]);
  });

  it.each(validFixtureRepos)("loads a valid repository contract for %s", async (name) => {
    const root = fixtureRepositoryPath(name);
    const loaded = await loadRuntimeContract({ repositoryRoot: root });

    expect(loaded).toMatchObject({
      ok: true,
      contract: {
        repository: {
          name
        }
      }
    });
  });

  it("rejects invalid runtime fixture fields through contract validation", async () => {
    const root = fixtureRepositoryPath("invalid-runtime-fields");

    await expect(
      parseRepositoryContractFile(`${root}/.board/repository.yaml`)
    ).rejects.toMatchObject({
      kind: "validation",
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: "applications.api.id"
        })
      ])
    });
  });

  it("builds setup, service, app, port, and health steps from the compose fixture without Docker", async () => {
    const contract = await parseRepositoryContractFile(
      `${fixtureRepositoryPath("compose-dependency")}/.board/repository.yaml`
    );
    const result = buildBootstrapPlan({
      repositoryRoot: fixtureRepositoryPath("compose-dependency"),
      contract
    });

    expect(result.plan.steps.map((step) => step.id)).toEqual([
      "load-contract",
      "inspect-prerequisites",
      "resolve-environment",
      "setup-install",
      "setup-migrate",
      "setup-seed",
      "setup-step-warm-cache",
      "service-postgres",
      "application-api",
      "application-health-api",
      "record-state"
    ]);
    expect(result.plan.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "compose-service-postgres",
          kind: "compose-service"
        }),
        expect.objectContaining({
          id: "service-port-postgres-5432",
          kind: "port"
        }),
        expect.objectContaining({
          id: "process-api",
          kind: "process"
        }),
        expect.objectContaining({
          id: "application-health-api",
          kind: "health-check"
        })
      ])
    );
  });

  it("runs setup ordering against local helper scripts", async () => {
    const root = fixtureRepositoryPath("compose-dependency");
    const contract = await parseRepositoryContractFile(`${root}/.board/repository.yaml`);
    const plan = buildBootstrapPlan({ repositoryRoot: root, contract }).plan;
    const environment = resolveRuntimeEnvironment({ contract, plan });
    const executor = createMockRuntimeCommandExecutor();
    const result = await runSetupSteps({
      plan,
      environment,
      runCommand: executor.runCommand
    });

    expect(result.commandResults.map((command) => command.id)).toEqual([
      "setup-install",
      "setup-migrate",
      "setup-seed",
      "setup-step-warm-cache"
    ]);
    expect(executor.calls.map((call) => call.id)).toEqual([
      "setup-install",
      "setup-migrate",
      "setup-seed",
      "setup-step-warm-cache"
    ]);
    expect(result.errors).toEqual([]);
  });

  it("preserves failed setup state from the failing fixture", async () => {
    const repositoryRoot = await copyFixtureRepository("failing-setup");
    const stateStore = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await copyFixtureRepository("minimal-node-app")
      })
    );
    const result = await startRuntime({
      repositoryRoot,
      stateStore,
      sessionId: "fixture-failing-setup"
    });

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      session: {
        id: "fixture-failing-setup",
        commandResults: [
          expect.objectContaining({
            id: "setup-install",
            status: "failed",
            exitCode: 2
          })
        ]
      }
    });
  });

  it("blocks runtime startup when a required environment variable is missing", async () => {
    const repositoryRoot = await copyFixtureRepository("missing-env");
    const stateStore = createJsonRuntimeStateStore(
      resolveRuntimeStateStorePaths({
        repositoryStateRoot: await copyFixtureRepository("python-health-app")
      })
    );
    const result = await startRuntime({
      repositoryRoot,
      stateStore,
      sessionId: "fixture-missing-env"
    });

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      session: {
        id: "fixture-missing-env",
        errors: ["API_TOKEN is required for local runtime and is not set."]
      }
    });
    expect(result.session?.commandResults).toEqual([]);
  });
});
