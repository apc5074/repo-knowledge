import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

import {
  parseRepositoryContractFile,
  RepositoryContractParseError,
  type RepositoryContract,
  type ValidationIssue
} from "@repo-knowledge/repository-contract";

import type { DiagnosticFinding } from "./types.js";

export const defaultDoctorContractPath = ".board/repository.yaml";

export type DoctorGitMetadata = {
  readonly available: boolean;
  readonly repositoryRoot?: string;
  readonly commitSha?: string;
  readonly branch?: string;
  readonly warnings: readonly string[];
};

export type DoctorRepositoryContext = {
  readonly repositoryRoot: string;
  readonly contractPath: string;
  readonly contractVersion?: number;
  readonly contract?: RepositoryContract;
  readonly git: DoctorGitMetadata;
  readonly componentIds: readonly string[];
  readonly applicationIds: readonly string[];
  readonly serviceIds: readonly string[];
  readonly environmentNames: readonly string[];
  readonly setupStepIds: readonly string[];
  readonly verificationCheckIds: readonly string[];
  readonly verificationRuleIds: readonly string[];
  readonly generatedPathPatterns: readonly string[];
  readonly documentationPathPatterns: readonly string[];
  readonly knownLimitationIds: readonly string[];
  readonly warnings: readonly string[];
  readonly findings: readonly DiagnosticFinding[];
};

export type LoadDoctorRepositoryContextInput = {
  readonly startDirectory?: string;
  readonly repositoryRoot?: string;
  readonly contractPath?: string;
  readonly runGitCommand?: GitCommandRunner;
};

export type GitCommandResult = {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

export type GitCommandRunner = (args: readonly string[], cwd: string) => Promise<GitCommandResult>;

export async function loadDoctorRepositoryContext(
  input: LoadDoctorRepositoryContextInput = {}
): Promise<DoctorRepositoryContext> {
  const repositoryRoot =
    input.repositoryRoot ?? (await locateRepositoryRoot(input.startDirectory ?? process.cwd()));
  const contractPath = resolveDoctorContractPath({
    repositoryRoot,
    contractPath: input.contractPath
  });
  const git = await inspectGitMetadata(repositoryRoot, input.runGitCommand);

  try {
    await access(contractPath);
  } catch (error) {
    if (isNotFoundError(error)) {
      return emptyContext({
        repositoryRoot,
        contractPath,
        git,
        findings: [missingContractFinding(contractPath)]
      });
    }

    return emptyContext({
      repositoryRoot,
      contractPath,
      git,
      findings: [contractReadErrorFinding(contractPath, error)]
    });
  }

  try {
    const contract = await parseRepositoryContractFile(contractPath);

    return {
      repositoryRoot,
      contractPath,
      contractVersion: contract.version,
      contract,
      git,
      componentIds: componentIds(contract),
      applicationIds: Object.keys(contract.applications ?? {}).sort(),
      serviceIds: Object.keys(contract.services ?? {}).sort(),
      environmentNames: Object.keys(contract.environment ?? {}).sort(),
      setupStepIds: setupStepIds(contract),
      verificationCheckIds: verificationCheckIds(contract),
      verificationRuleIds: (contract.verification?.rules ?? []).map((rule) => rule.id).sort(),
      generatedPathPatterns: (contract.generated_files ?? []).map((path) => path.pattern).sort(),
      documentationPathPatterns: documentationPathPatterns(contract),
      knownLimitationIds: (contract.known_limitations ?? [])
        .map((limitation) => limitation.id)
        .sort(),
      warnings: git.warnings,
      findings: []
    };
  } catch (error) {
    if (error instanceof RepositoryContractParseError) {
      return emptyContext({
        repositoryRoot,
        contractPath,
        git,
        findings: [invalidContractFinding(contractPath, error.issues, error.message)]
      });
    }

    return emptyContext({
      repositoryRoot,
      contractPath,
      git,
      findings: [contractReadErrorFinding(contractPath, error)]
    });
  }
}

export function resolveDoctorContractPath(input: {
  readonly repositoryRoot: string;
  readonly contractPath?: string;
}): string {
  return input.contractPath === undefined
    ? join(input.repositoryRoot, defaultDoctorContractPath)
    : resolve(input.contractPath);
}

async function locateRepositoryRoot(startDirectory: string): Promise<string> {
  let current = resolve(startDirectory);

  for (;;) {
    if (await exists(join(current, ".git"))) {
      return current;
    }

    if (await exists(join(current, defaultDoctorContractPath))) {
      return current;
    }

    const parent = dirname(current);

    if (parent === current) {
      return resolve(startDirectory);
    }

    current = parent;
  }
}

async function inspectGitMetadata(
  repositoryRoot: string,
  runGitCommand: GitCommandRunner = runDefaultGitCommand
): Promise<DoctorGitMetadata> {
  const root = await runGitCommand(["rev-parse", "--show-toplevel"], repositoryRoot);

  if (root.exitCode !== 0) {
    return {
      available: false,
      warnings: ["Git metadata is unavailable for this repository context."]
    };
  }

  const commit = await runGitCommand(["rev-parse", "HEAD"], repositoryRoot);
  const branch = await runGitCommand(["branch", "--show-current"], repositoryRoot);

  return {
    available: true,
    repositoryRoot: root.stdout.trim() || undefined,
    commitSha: commit.exitCode === 0 ? commit.stdout.trim() || undefined : undefined,
    branch: branch.exitCode === 0 ? branch.stdout.trim() || undefined : undefined,
    warnings: [
      ...(commit.exitCode === 0 ? [] : ["Git commit metadata is unavailable."]),
      ...(branch.exitCode === 0 ? [] : ["Git branch metadata is unavailable."])
    ]
  };
}

function emptyContext(input: {
  readonly repositoryRoot: string;
  readonly contractPath: string;
  readonly git: DoctorGitMetadata;
  readonly findings: readonly DiagnosticFinding[];
}): DoctorRepositoryContext {
  return {
    repositoryRoot: input.repositoryRoot,
    contractPath: input.contractPath,
    git: input.git,
    componentIds: [],
    applicationIds: [],
    serviceIds: [],
    environmentNames: [],
    setupStepIds: [],
    verificationCheckIds: [],
    verificationRuleIds: [],
    generatedPathPatterns: [],
    documentationPathPatterns: [],
    knownLimitationIds: [],
    warnings: input.git.warnings,
    findings: input.findings
  };
}

function componentIds(contract: RepositoryContract): readonly string[] {
  return [
    ...new Set([
      ...Object.keys(contract.applications ?? {}),
      ...Object.keys(contract.services ?? {})
    ])
  ].sort();
}

function setupStepIds(contract: RepositoryContract): readonly string[] {
  return [
    ...Object.entries({
      install: contract.setup?.install,
      build_containers: contract.setup?.build_containers,
      start_services: contract.setup?.start_services,
      migrate: contract.setup?.migrate,
      seed: contract.setup?.seed,
      generate: contract.setup?.generate,
      health_check: contract.setup?.health_check,
      smoke_check: contract.setup?.smoke_check
    })
      .filter(([, command]) => command !== undefined)
      .map(([id]) => id),
    ...(contract.setup?.steps ?? []).map((step) => step.id)
  ].sort();
}

function verificationCheckIds(contract: RepositoryContract): readonly string[] {
  return [
    ...(contract.verification?.default ?? []).map((check) => check.id),
    ...(contract.verification?.rules ?? []).flatMap((rule) =>
      (rule.checks ?? []).map((check) => check.id)
    )
  ].sort();
}

function documentationPathPatterns(contract: RepositoryContract): readonly string[] {
  return [
    ...(contract.source_of_truth_paths ?? []).map((path) => path.pattern),
    ...(contract.sensitive_paths ?? []).map((path) => path.pattern),
    ...(contract.unsafe_paths ?? []).map((path) => path.pattern)
  ].sort();
}

function missingContractFinding(contractPath: string): DiagnosticFinding {
  return contractFinding({
    id: "contract.missing",
    severity: "blocking",
    confidence: "confirmed",
    title: "Board repository contract is missing",
    summary: `No Board repository contract was found at ${contractPath}.`,
    path: contractPath,
    nextSteps: ["Run board init or provide --contract-path before running diagnostics."]
  });
}

function invalidContractFinding(
  contractPath: string,
  issues: readonly ValidationIssue[],
  message: string
): DiagnosticFinding {
  return contractFinding({
    id: "contract.invalid",
    severity: "blocking",
    confidence: "confirmed",
    title: "Board repository contract is invalid",
    summary: message,
    path: contractPath,
    metadata: {
      issueCount: issues.length
    },
    nextSteps: ["Fix the contract validation errors, then run board doctor again."]
  });
}

function contractReadErrorFinding(contractPath: string, error: unknown): DiagnosticFinding {
  return contractFinding({
    id: "contract.read_error",
    severity: "error",
    confidence: "confirmed",
    title: "Board repository contract could not be read",
    summary: error instanceof Error ? error.message : String(error),
    path: contractPath,
    nextSteps: ["Check contract file permissions, then run board doctor again."]
  });
}

function contractFinding(input: {
  readonly id: string;
  readonly severity: DiagnosticFinding["severity"];
  readonly confidence: DiagnosticFinding["confidence"];
  readonly title: string;
  readonly summary: string;
  readonly path: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
  readonly nextSteps: readonly string[];
}): DiagnosticFinding {
  return {
    id: input.id,
    ruleId: input.id,
    category: "contract",
    kind: "direct_local_fact",
    severity: input.severity,
    confidence: input.confidence,
    status: "open",
    title: input.title,
    summary: input.summary,
    evidence: [
      {
        kind: "contract",
        summary: input.summary,
        path: input.path,
        metadata: input.metadata
      }
    ],
    counterEvidence: [],
    suggestedNextSteps: input.nextSteps,
    matchedKnownProblemIds: []
  };
}

async function runDefaultGitCommand(
  args: readonly string[],
  cwd: string
): Promise<GitCommandResult> {
  return new Promise((resolveResult) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`;
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`;
    });
    child.on("error", () => {
      resolveResult({
        exitCode: null,
        stdout,
        stderr
      });
    });
    child.on("close", (exitCode) => {
      resolveResult({
        exitCode,
        stdout,
        stderr
      });
    });
  });
}

async function exists(path: string): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
