import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  normalizeScanResult,
  scanRepository
} from "@repo-knowledge/scanner-core";
import { describe, expect, it } from "vitest";

import {
  createContractReferenceDiagnosticRules,
  createDockerDiagnosticRules,
  createEnvironmentDiagnosticRules,
  createLegacyCandidateStore,
  createPortDiagnosticRules,
  createRuntimeFailureDiagnosticRules,
  createVerificationDiagnosticRules,
  importLegacyCandidatesFromScannerFacts,
  inspectDocker,
  inspectLocalEnvironment,
  inspectPorts,
  inspectRuntimeSessions,
  inspectVerificationHistory,
  loadDoctorRepositoryContext,
  runDiagnosticEngine,
  createJsonDoctorStateStore,
  resolveDoctorStateStorePaths
} from "../src/index.js";
import {
  copyDoctorFixtureRepository,
  seedFailedRuntimeState,
  seedFailedVerificationHistory,
  seedFalsePositiveLegacyReview
} from "./fixtures.js";

describe("doctor fixture repositories", () => {
  it("cover diagnostic categories with deterministic fixture state", async () => {
    const fixture = await copyDoctorFixtureRepository("doctor-all-categories");
    await seedFailedRuntimeState(fixture.stateRoot);
    await seedFailedVerificationHistory(fixture.stateRoot);
    const repository = await loadDoctorRepositoryContext({
      repositoryRoot: fixture.root,
      contractPath: fixture.contractPath,
      runGitCommand: successfulGit(fixture.root)
    });
    const inventory = await buildFileInventory({ root: fixture.root });
    const scan = normalizeScanResult(
      await scanRepository({
        root: fixture.root,
        inventory,
        detectors: createDefaultRepositoryDetectors()
      })
    );
    const stateStore = createJsonDoctorStateStore(
      resolveDoctorStateStorePaths({ repositoryStateRoot: fixture.stateRoot })
    );
    await stateStore.ensure();
    const legacyImport = await importLegacyCandidatesFromScannerFacts({
      facts: scan.facts,
      store: createLegacyCandidateStore({ stateStore }),
      commitSha: "abc123"
    });
    const runtime = await inspectRuntimeSessions({ repositoryStateRoot: fixture.stateRoot });
    const verification = await inspectVerificationHistory({
      repositoryStateRoot: fixture.stateRoot
    });
    const docker = await inspectDocker({
      context: repository,
      runDockerCommand: async (args) => ({
        exitCode: args[0] === "--version" ? 0 : 1,
        stdout: args[0] === "--version" ? "Docker version 28.0.0" : "",
        stderr: "fixture docker failure",
        timedOut: false
      })
    });
    const ports = await inspectPorts({
      context: repository,
      runtimeInspection: runtime,
      checkPort: async (port) => ({
        status: port.port === 3000 ? "occupied" : "closed"
      }),
      requireListening: true
    });
    const localEnvironment = await inspectLocalEnvironment({
      context: repository,
      env: {},
      runVersionCommand: async (command) => ({
        exitCode: command === "node" ? 0 : 1,
        stdout: command === "node" ? "v22.0.0" : "",
        stderr: command === "node" ? "" : "missing",
        timedOut: false
      }),
      fileExists: async (path) => path.endsWith("package.json")
    });
    const result = await runDiagnosticEngine({
      repository,
      rules: [
        ...createEnvironmentDiagnosticRules(),
        ...createRuntimeFailureDiagnosticRules(),
        ...createDockerDiagnosticRules(),
        ...createPortDiagnosticRules(),
        ...createVerificationDiagnosticRules(),
        ...createContractReferenceDiagnosticRules()
      ],
      inspectors: [
        {
          name: "repository-inventory",
          run: async () => ({
            context: {
              repositoryInventory: {
                paths: inventory.files,
                commands: commandsFromScan(scan.facts),
                documentationReferences: [
                  {
                    sourcePath: "docs/setup.md",
                    kind: "path",
                    value: "src/removed.ts",
                    line: 3
                  },
                  {
                    sourcePath: "docs/setup.md",
                    kind: "command",
                    value: "missing-docs/check.js",
                    line: 3
                  }
                ]
              }
            }
          })
        },
        {
          name: "local-environment",
          run: async () => ({ context: { localEnvironment } })
        },
        {
          name: "runtime",
          run: async () => ({ context: { runtime } })
        },
        {
          name: "docker",
          run: async () => ({ context: { docker } })
        },
        {
          name: "ports",
          run: async () => ({ context: { ports } })
        },
        {
          name: "verification",
          run: async () => ({ context: { verification } })
        }
      ]
    });

    expect(new Set(result.run.findings.map((finding) => finding.category))).toEqual(
      new Set(["environment", "runtime", "docker", "ports", "verification", "contract", "docs"])
    );
    expect(legacyImport.candidates.map((candidate) => candidate.target.kind)).toEqual(
      expect.arrayContaining(["path", "symbol", "command"])
    );
  });

  it("includes false-positive legacy review fixture state", async () => {
    const fixture = await copyDoctorFixtureRepository("doctor-false-positives");
    const candidate = await seedFalsePositiveLegacyReview(fixture.stateRoot);
    const stateStore = createJsonDoctorStateStore(
      resolveDoctorStateStorePaths({ repositoryStateRoot: fixture.stateRoot })
    );
    const stored = await stateStore.readLegacyCandidates();

    expect(stored.value.candidates).toEqual([
      expect.objectContaining({
        id: candidate.id,
        status: "false_positive",
        counterEvidence: expect.arrayContaining([
          expect.objectContaining({
            path: "README.md"
          })
        ])
      })
    ]);
  });
});

function commandsFromScan(
  facts: Awaited<ReturnType<typeof scanRepository>>["facts"]
): readonly string[] {
  return [
    ...new Set(
      facts.flatMap((fact) => {
        const command = (fact.value as Record<string, unknown>).command;
        return typeof command === "string" ? [command.split(/\s+/)[0] ?? command] : [];
      })
    )
  ];
}

function successfulGit(repositoryRoot: string) {
  return async (args: readonly string[]) => ({
    exitCode: 0,
    stdout:
      args.join(" ") === "rev-parse --show-toplevel"
        ? repositoryRoot
        : args.join(" ") === "rev-parse HEAD"
          ? "abc123"
          : "main",
    stderr: ""
  });
}
