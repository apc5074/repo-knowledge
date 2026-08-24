import {
  buildFileInventory,
  createDefaultRepositoryDetectors,
  normalizeScanResult,
  scanRepository,
  type ScannerFact
} from "@repo-knowledge/scanner-core";

import { loadDoctorRepositoryContext, type DoctorRepositoryContext } from "./contract-loader.js";
import {
  type DiagnosticInspector,
  type DiagnosticInspectorName,
  runDiagnosticEngine
} from "./diagnostic-engine.js";
import { type RepositoryReferenceInventory } from "./diagnostic-rule.js";
import { createContractReferenceDiagnosticRules } from "./contract-rules.js";
import { inspectDocker } from "./docker-inspector.js";
import { createDockerDiagnosticRules } from "./docker-rules.js";
import { createEnvironmentDiagnosticRules } from "./environment-rules.js";
import { attachKnownProblemMatches, matchKnownProblems } from "./known-problem-matcher.js";
import { createKnownProblemStore } from "./known-problem-store.js";
import { createLegacyCandidateStore } from "./legacy-candidate-store.js";
import { importLegacyCandidatesFromScannerFacts } from "./legacy-candidate-matcher.js";
import { inspectLocalEnvironment } from "./local-environment.js";
import { inspectPorts } from "./port-inspector.js";
import { createPortDiagnosticRules } from "./port-rules.js";
import { createRuntimeFailureDiagnosticRules } from "./runtime-rules.js";
import { inspectRuntimeSessions } from "./runtime-inspector.js";
import { createJsonDoctorStateStore, resolveDoctorStateStorePaths } from "./state-store.js";
import { matchStaleWorkflowCandidates } from "./stale-workflow-matcher.js";
import type { DiagnosticCategory, DoctorReport, DoctorRun } from "./types.js";
import { inspectVerificationHistory } from "./verification-inspector.js";
import { createVerificationDiagnosticRules } from "./verification-rules.js";

export type RunDoctorInput = {
  readonly repositoryRoot?: string;
  readonly startDirectory?: string;
  readonly contractPath?: string;
  readonly repositoryStateRoot?: string;
  readonly categories?: readonly DiagnosticCategory[];
  readonly includeLogs?: boolean;
  readonly disabledInspectors?: readonly DiagnosticInspectorName[];
  readonly dryRun?: boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly runId?: string;
};

export type RunDoctorResult = {
  readonly report: DoctorReport;
  readonly statePaths?: {
    readonly run?: string;
    readonly latest?: string;
    readonly knownProblems?: string;
    readonly resolutions?: string;
    readonly legacyIndex?: string;
  };
  readonly enabledInspectors: readonly DiagnosticInspectorName[];
  readonly skippedInspectors: readonly {
    readonly name: DiagnosticInspectorName;
    readonly reason: string;
  }[];
};

export async function runDoctor(input: RunDoctorInput = {}): Promise<RunDoctorResult> {
  const repository = await loadDoctorRepositoryContext({
    repositoryRoot: input.repositoryRoot,
    startDirectory: input.startDirectory,
    contractPath: input.contractPath
  });
  const stateStore =
    input.repositoryStateRoot === undefined
      ? undefined
      : createJsonDoctorStateStore(
          resolveDoctorStateStorePaths({ repositoryStateRoot: input.repositoryStateRoot })
        );
  await stateStore?.ensure();
  const legacyStore =
    stateStore === undefined ? undefined : createLegacyCandidateStore({ stateStore });
  const scanner = await scanForDoctor(repository, legacyStore);
  const inspectors = createDefaultDoctorInspectors({
    repositoryStateRoot: input.repositoryStateRoot,
    inventory: scanner.inventory,
    env: input.env
  });
  const engine = await runDiagnosticEngine({
    repository,
    rules: [
      ...createEnvironmentDiagnosticRules(),
      ...createRuntimeFailureDiagnosticRules(),
      ...createDockerDiagnosticRules(),
      ...createPortDiagnosticRules(),
      ...createVerificationDiagnosticRules(),
      ...createContractReferenceDiagnosticRules()
    ],
    inspectors,
    categories: input.categories,
    disabledInspectors: input.disabledInspectors,
    dryRun: input.dryRun,
    runId: input.runId
  });
  const knownProblemStore =
    stateStore === undefined ? undefined : createKnownProblemStore({ stateStore });
  const knownProblemIndex = await knownProblemStore?.readAll();
  const matches = matchKnownProblems({
    findings: engine.run.findings,
    knownProblems: knownProblemIndex?.value.problems ?? []
  });
  const findings = attachKnownProblemMatches(engine.run.findings, matches);
  const run = {
    ...engine.run,
    findings,
    knownProblemMatches: matches,
    legacyCandidates: scanner.legacyCandidates,
    warnings: [
      ...engine.run.warnings,
      ...scanner.warnings,
      ...(knownProblemIndex?.warnings.map((warning) => warning.message) ?? [])
    ],
    summary: summarizeFindings(findings)
  } satisfies DoctorRun;

  if (knownProblemStore !== undefined) {
    await Promise.all(findings.map((finding) => knownProblemStore.upsertFinding(finding)));
  }

  await stateStore?.writeRun(run);
  const [knownProblems, resolutions] = await Promise.all([
    stateStore?.readKnownProblems(),
    stateStore?.readResolutions()
  ]);
  const report = {
    ok: true,
    run,
    knownProblems: knownProblems?.value.problems ?? [],
    resolutions: resolutions?.value.resolutions ?? [],
    nextSteps: [...new Set(findings.flatMap((finding) => finding.suggestedNextSteps))]
  } satisfies DoctorReport;

  return {
    report,
    statePaths:
      stateStore === undefined
        ? undefined
        : {
            run: `${stateStore.paths.doctorRunsRoot}/${run.runId}.json`,
            latest: stateStore.paths.latestRunPath,
            knownProblems: stateStore.paths.knownProblemsPath,
            resolutions: stateStore.paths.resolutionsPath,
            legacyIndex: stateStore.paths.legacyIndexPath
          },
    enabledInspectors: inspectors
      .map((inspector) => inspector.name)
      .filter((name) => !(input.disabledInspectors ?? []).includes(name)),
    skippedInspectors: engine.skippedInspectors
  };
}

function createDefaultDoctorInspectors(input: {
  readonly repositoryStateRoot?: string;
  readonly inventory: RepositoryReferenceInventory;
  readonly env?: Readonly<Record<string, string | undefined>>;
}): readonly DiagnosticInspector[] {
  return [
    {
      name: "repository-inventory",
      run: async () => ({
        context: {
          repositoryInventory: input.inventory
        }
      })
    },
    {
      name: "local-environment",
      run: async (context) => {
        const localEnvironment = await inspectLocalEnvironment({
          context: context.repository,
          env: input.env
        });

        return {
          context: {
            localEnvironment
          },
          warnings: localEnvironment.warnings
        };
      }
    },
    {
      name: "runtime",
      run: async () => {
        const runtime = await inspectRuntimeSessions({
          repositoryStateRoot: input.repositoryStateRoot
        });

        return {
          context: {
            runtime
          },
          warnings: runtime.warnings
        };
      }
    },
    {
      name: "docker",
      run: async (context) => {
        const docker = await inspectDocker({
          context: context.repository
        });

        return {
          context: {
            docker
          },
          warnings: docker.warnings
        };
      }
    },
    {
      name: "ports",
      run: async (context) => {
        const ports = await inspectPorts({
          context: context.repository,
          runtimeInspection: context.runtime
        });

        return {
          context: {
            ports
          },
          warnings: ports.warnings
        };
      }
    },
    {
      name: "verification",
      run: async () => {
        const verification = await inspectVerificationHistory({
          repositoryStateRoot: input.repositoryStateRoot
        });

        return {
          context: {
            verification
          },
          warnings: verification.warnings
        };
      }
    }
  ];
}

async function scanForDoctor(
  repository: DoctorRepositoryContext,
  legacyStore: ReturnType<typeof createLegacyCandidateStore> | undefined
): Promise<{
  readonly inventory: RepositoryReferenceInventory;
  readonly legacyCandidates: DoctorRun["legacyCandidates"];
  readonly warnings: readonly string[];
}> {
  const inventory = await buildFileInventory({ root: repository.repositoryRoot });
  const scan = normalizeScanResult(
    await scanRepository({
      root: repository.repositoryRoot,
      inventory,
      detectors: createDefaultRepositoryDetectors()
    })
  );
  const imported = await importLegacyCandidatesFromScannerFacts({
    facts: scan.facts,
    store: legacyStore,
    commitSha: repository.git.commitSha
  });
  const staleWorkflows = await matchStaleWorkflowCandidates({
    facts: scan.facts,
    activeCommands: commandsFromFacts(scan.facts),
    store: legacyStore
  });

  return {
    inventory: {
      paths: inventory.files,
      commands: commandsFromFacts(scan.facts)
    },
    legacyCandidates: mergeCandidates([...imported.candidates, ...staleWorkflows.candidates]),
    warnings: [
      ...(inventory.warnings ?? []).map((warning) => warning.message),
      ...scan.warnings.map((warning) => warning.message),
      ...scan.errors.map((error) => error.message),
      ...imported.warnings,
      ...staleWorkflows.warnings
    ]
  };
}

function commandsFromFacts(facts: readonly ScannerFact[]): readonly string[] {
  return [
    ...new Set(
      facts.flatMap((fact) => {
        if (fact.kind !== "command.detected" && fact.kind !== "legacy.command_candidate_detected") {
          return [];
        }

        const command = (fact.value as Record<string, unknown>).command;
        return typeof command === "string" && command.length > 0 ? [command] : [];
      })
    )
  ].sort();
}

function mergeCandidates(candidates: readonly DoctorRun["legacyCandidates"][number][]) {
  const byId = new Map<string, DoctorRun["legacyCandidates"][number]>();

  for (const candidate of candidates) {
    byId.set(candidate.id, candidate);
  }

  return [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function summarizeFindings(findings: DoctorRun["findings"]): DoctorRun["summary"] {
  return {
    totalFindings: findings.length,
    bySeverity: {
      info: findings.filter((finding) => finding.severity === "info").length,
      warning: findings.filter((finding) => finding.severity === "warning").length,
      error: findings.filter((finding) => finding.severity === "error").length,
      blocking: findings.filter((finding) => finding.severity === "blocking").length
    },
    byCategory: {
      environment: findings.filter((finding) => finding.category === "environment").length,
      runtime: findings.filter((finding) => finding.category === "runtime").length,
      docker: findings.filter((finding) => finding.category === "docker").length,
      ports: findings.filter((finding) => finding.category === "ports").length,
      verification: findings.filter((finding) => finding.category === "verification").length,
      contract: findings.filter((finding) => finding.category === "contract").length,
      docs: findings.filter((finding) => finding.category === "docs").length,
      legacy: findings.filter((finding) => finding.category === "legacy").length
    },
    directLocalFacts: findings.filter((finding) => finding.kind === "direct_local_fact").length,
    inferredCandidates: findings.filter((finding) => finding.kind === "inferred_candidate").length
  };
}
