import type { RepositoryContract } from "@repo-knowledge/repository-contract";

import type { RuntimePrerequisiteResult, RuntimeStatus } from "./types.js";

export type DevContainerRequirement = {
  readonly detected: boolean;
  readonly required: boolean;
  readonly sourcePaths: readonly string[];
};

export type DevContainerRuntimeReport = {
  readonly status: RuntimeStatus;
  readonly required: boolean;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly nextSteps: readonly string[];
  readonly prerequisites: readonly RuntimePrerequisiteResult[];
};

export function detectDevContainerRequirement(
  contract: RepositoryContract
): DevContainerRequirement {
  const { sourcePaths, required } = collectDevContainerSourcePaths(contract);

  return {
    detected: sourcePaths.length > 0,
    required,
    sourcePaths
  };
}

export function createDevContainerRuntimeReport(
  requirement: DevContainerRequirement
): DevContainerRuntimeReport {
  if (!requirement.detected) {
    return {
      status: "skipped",
      required: false,
      warnings: [],
      errors: [],
      nextSteps: [],
      prerequisites: []
    };
  }

  const prerequisite = createDevContainerPrerequisite();

  if (requirement.required) {
    return {
      status: "failed",
      required: true,
      warnings: [],
      errors: [
        "Dev Container based runtime was detected as required, but Phase 5 only reports this flow and does not start commands inside the container."
      ],
      nextSteps: [
        "Install the devcontainer CLI and run the repository through its documented Dev Container workflow, or update the contract if host startup is valid."
      ],
      prerequisites: [prerequisite]
    };
  }

  return {
    status: "skipped",
    required: false,
    warnings: [
      "Dev Container metadata was detected, but it is not marked required; host runtime commands may continue."
    ],
    errors: [],
    nextSteps: ["Use the Dev Container workflow manually if host runtime commands fail."],
    prerequisites: [prerequisite]
  };
}

function createDevContainerPrerequisite(): RuntimePrerequisiteResult {
  return {
    id: "devcontainer",
    kind: "devcontainer",
    command: "devcontainer",
    args: ["--version"],
    status: "unknown",
    required: false,
    summary: "Dev Container CLI availability has not been inspected."
  };
}

function collectDevContainerSourcePaths(contract: RepositoryContract): {
  readonly sourcePaths: readonly string[];
  readonly required: boolean;
} {
  const paths = new Set<string>();
  let required = false;
  const collectEvidence = (
    evidence: readonly {
      readonly source_path?: string;
    }[] = []
  ) => {
    for (const item of evidence) {
      const sourcePath = item.source_path;

      if (sourcePath !== undefined && isDevContainerPath(sourcePath)) {
        paths.add(sourcePath);
      }
    }
  };

  for (const application of Object.values(contract.applications ?? {})) {
    collectEvidence(application.evidence);
  }
  for (const service of Object.values(contract.services ?? {})) {
    collectEvidence(service.evidence);
  }
  for (const step of contract.setup?.steps ?? []) {
    collectEvidence(step.evidence);
  }
  for (const sourcePath of contract.source_of_truth_paths ?? []) {
    collectEvidence(sourcePath.evidence);

    if (isDevContainerPath(sourcePath.pattern)) {
      paths.add(sourcePath.pattern);
      required =
        required ||
        /required|primary|must|source of truth/i.test(sourcePath.description ?? "") ||
        sourcePath.governs.includes("**/*");
    }
  }

  return {
    sourcePaths: [...paths].sort(),
    required
  };
}

function isDevContainerPath(path: string): boolean {
  return /(^|\/)\.devcontainer\/devcontainer\.json$/i.test(path);
}
