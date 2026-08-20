import { join } from "node:path";

import type {
  CommandStep,
  HealthCheck,
  RepositoryContract
} from "@repo-knowledge/repository-contract";

import { createRuntimeStep } from "./runtime.js";
import type {
  BootstrapPlan,
  BootstrapPlanInput,
  RuntimePlannedCommand,
  RuntimeResource,
  RuntimeStep
} from "./types.js";
import { collectRuntimePrerequisiteChecks } from "./prerequisites.js";

const namedSetupOrder = [
  "install",
  "build_containers",
  "start_services",
  "migrate",
  "seed",
  "generate",
  "health_check",
  "smoke_check"
] as const;

export function createBootstrapPlan(input: BootstrapPlanInput): BootstrapPlan {
  const contract = input.contract;

  if (contract === undefined) {
    return {
      repositoryRoot: input.repositoryRoot,
      contractPath: input.contractPath,
      dryRun: input.dryRun ?? true,
      steps: [
        createRuntimeStep("load-contract", "load-contract", "Load repository contract"),
        createRuntimeStep(
          "inspect-prerequisites",
          "inspect-prerequisites",
          "Inspect local prerequisites"
        ),
        createRuntimeStep(
          "resolve-environment",
          "resolve-environment",
          "Resolve environment variable names"
        ),
        createRuntimeStep("record-state", "record-state", "Record runtime session state")
      ],
      resources: [],
      prerequisites: [],
      warnings: [
        "No repository contract was provided; runtime plan contains only the bootstrap skeleton."
      ]
    };
  }

  return createContractBackedBootstrapPlan(input, contract);
}

function createContractBackedBootstrapPlan(
  input: BootstrapPlanInput,
  contract: RepositoryContract
): BootstrapPlan {
  const warnings: string[] = [];
  const resources: RuntimeResource[] = [];
  const steps: RuntimeStep[] = [
    createRuntimeStep("load-contract", "load-contract", "Load repository contract", {
      summary: "Repository contract is loaded and valid."
    }),
    createRuntimeStep(
      "inspect-prerequisites",
      "inspect-prerequisites",
      "Inspect local prerequisites",
      {
        summary: "Prerequisite checks will run before command execution."
      }
    ),
    createRuntimeStep(
      "resolve-environment",
      "resolve-environment",
      "Resolve environment variables",
      {
        dependsOn: ["inspect-prerequisites"],
        summary: "Environment variable names will be checked without persisting secret values."
      }
    )
  ];

  const includedIds = createIncludedIdSet(input.only);

  steps.push(...buildNamedSetupSteps(input, contract));
  steps.push(...buildOrderedSetupSteps(input, contract));
  steps.push(...buildServiceSteps(input, contract, resources, warnings, includedIds));
  steps.push(...buildApplicationSteps(input, contract, resources, warnings, includedIds));
  steps.push(...buildHealthCheckSteps(input, contract, resources, includedIds));
  steps.push(
    createRuntimeStep("record-state", "record-state", "Record runtime session state", {
      dependsOn: steps.map((step) => step.id).filter((id) => id !== "load-contract"),
      summary: "Persist final session state for board status and future Bootstrap Agent tools."
    })
  );

  const plan: BootstrapPlan = {
    repositoryRoot: input.repositoryRoot,
    contractPath: input.contractPath,
    dryRun: input.dryRun ?? true,
    steps,
    resources,
    prerequisites: [],
    warnings
  };

  return {
    ...plan,
    prerequisites: collectRuntimePrerequisiteChecks(plan)
  };
}

function buildNamedSetupSteps(
  input: BootstrapPlanInput,
  contract: RepositoryContract
): RuntimeStep[] {
  if (input.skipSetup === true) {
    return namedSetupOrder
      .filter((key) => contract.setup?.[key] !== undefined)
      .map((key) =>
        createRuntimeStep(`setup-${key}`, "setup", setupTitle(key), {
          skippedReason: "Setup was skipped by runtime options.",
          summary: "Skipped by --skip-setup.",
          optional: true
        })
      );
  }

  return namedSetupOrder.flatMap((key) => {
    const command = contract.setup?.[key];

    if (command === undefined) {
      return [];
    }

    return [
      createRuntimeStep(`setup-${key}`, "setup", setupTitle(key), {
        command: toPlannedCommand(input.repositoryRoot, command),
        summary: `Run ${key} setup command from the repository contract.`,
        optional: command.optional ?? false,
        skippedReason: command.optional === true ? command.optional_reason : undefined
      })
    ];
  });
}

function buildOrderedSetupSteps(
  input: BootstrapPlanInput,
  contract: RepositoryContract
): RuntimeStep[] {
  if (input.skipSetup === true) {
    return (contract.setup?.steps ?? []).map((step) =>
      createRuntimeStep(`setup-step-${step.id}`, "setup", step.name ?? step.id, {
        dependsOn: (step.depends_on ?? []).map((dependencyId) => `setup-step-${dependencyId}`),
        skippedReason: "Setup was skipped by runtime options.",
        summary: "Skipped by --skip-setup.",
        optional: true
      })
    );
  }

  return (contract.setup?.steps ?? []).map((step) =>
    createRuntimeStep(`setup-step-${step.id}`, "setup", step.name ?? step.id, {
      dependsOn: (step.depends_on ?? []).map((dependencyId) => `setup-step-${dependencyId}`),
      command: toPlannedCommand(input.repositoryRoot, step.command),
      summary: `Run ${step.kind} setup step from the repository contract.`,
      optional: step.optional ?? false,
      skippedReason: step.optional === true ? step.optional_reason : undefined
    })
  );
}

function buildServiceSteps(
  input: BootstrapPlanInput,
  contract: RepositoryContract,
  resources: RuntimeResource[],
  warnings: string[],
  includedIds: ReadonlySet<string> | undefined
): RuntimeStep[] {
  return Object.values(contract.services ?? {}).flatMap((service) => {
    if (!isIncluded(service.id, includedIds)) {
      return [];
    }

    if (service.compose_service === undefined && service.image === undefined) {
      warnings.push(
        `Service ${service.id} has no compose_service or image; it will be reported but not started by the MVP runtime.`
      );
    }

    if (service.compose_service !== undefined) {
      resources.push({
        id: `compose-service-${service.id}`,
        kind: "compose-service",
        status: "pending",
        label: service.compose_service,
        metadata: {
          serviceId: service.id,
          type: service.type
        }
      });
    }

    for (const port of service.ports ?? []) {
      resources.push({
        id: `service-port-${service.id}-${port}`,
        kind: "port",
        status: "pending",
        label: `${service.id}:${port}`,
        metadata: {
          serviceId: service.id,
          port
        }
      });
    }

    return [
      createRuntimeStep(`service-${service.id}`, "service", service.name ?? service.id, {
        dependsOn: ["resolve-environment"],
        summary:
          service.compose_service === undefined
            ? "Service has no Compose mapping in the contract."
            : `Start Compose service ${service.compose_service}.`,
        optional: service.required === false,
        skippedReason: service.required === false ? service.optional_reason : undefined
      })
    ];
  });
}

function buildApplicationSteps(
  input: BootstrapPlanInput,
  contract: RepositoryContract,
  resources: RuntimeResource[],
  warnings: string[],
  includedIds: ReadonlySet<string> | undefined
): RuntimeStep[] {
  return Object.values(contract.applications ?? {}).flatMap((application) => {
    if (!isIncluded(application.id, includedIds)) {
      return [];
    }

    const command = application.dev ?? application.start;
    const dependencies = (application.depends_on ?? []).map(
      (dependencyId) => `service-${dependencyId}`
    );

    for (const port of application.ports ?? []) {
      resources.push({
        id: `application-port-${application.id}-${port}`,
        kind: "port",
        status: "pending",
        label: `${application.id}:${port}`,
        metadata: {
          applicationId: application.id,
          port
        }
      });
    }

    if (command === undefined) {
      warnings.push(
        `Application ${application.id} has no dev or start command; it will be reported but not launched by the MVP runtime.`
      );
    } else {
      resources.push({
        id: `process-${application.id}`,
        kind: "process",
        status: "pending",
        label: application.name ?? application.id,
        metadata: {
          applicationId: application.id,
          type: application.type
        }
      });
    }

    return [
      createRuntimeStep(
        `application-${application.id}`,
        "application",
        application.name ?? application.id,
        {
          dependsOn: dependencies,
          command:
            command === undefined
              ? undefined
              : toPlannedCommand(
                  input.repositoryRoot,
                  command,
                  application.working_directory ?? "."
                ),
          summary:
            command === undefined
              ? "Application has no runnable command in the contract."
              : `Start ${application.type} application process.`,
          optional: false
        }
      )
    ];
  });
}

function buildHealthCheckSteps(
  input: BootstrapPlanInput,
  contract: RepositoryContract,
  resources: RuntimeResource[],
  includedIds: ReadonlySet<string> | undefined
): RuntimeStep[] {
  if (input.healthChecks === false) {
    return [];
  }

  const steps: RuntimeStep[] = [];

  for (const service of Object.values(contract.services ?? {})) {
    if (!isIncluded(service.id, includedIds) || service.health_check === undefined) {
      continue;
    }

    steps.push(
      createHealthCheckStep(
        input.repositoryRoot,
        `service-health-${service.id}`,
        service.health_check,
        [`service-${service.id}`]
      )
    );
    resources.push(createHealthCheckResource(`service-health-${service.id}`, service.health_check));
  }

  for (const application of Object.values(contract.applications ?? {})) {
    if (!isIncluded(application.id, includedIds) || application.health_check === undefined) {
      continue;
    }

    steps.push(
      createHealthCheckStep(
        input.repositoryRoot,
        `application-health-${application.id}`,
        application.health_check,
        [`application-${application.id}`]
      )
    );
    resources.push(
      createHealthCheckResource(`application-health-${application.id}`, application.health_check)
    );
  }

  return steps;
}

function createHealthCheckStep(
  repositoryRoot: string,
  id: string,
  healthCheck: HealthCheck,
  dependsOn: readonly string[]
): RuntimeStep {
  return createRuntimeStep(
    id,
    "health-check",
    healthCheck.url ?? healthCheck.command?.command ?? id,
    {
      dependsOn,
      command:
        healthCheck.command === undefined
          ? undefined
          : toPlannedCommand(repositoryRoot, healthCheck.command),
      summary:
        healthCheck.url === undefined
          ? "Run command health check."
          : `Check URL ${healthCheck.url}.`
    }
  );
}

function createHealthCheckResource(id: string, healthCheck: HealthCheck): RuntimeResource {
  return {
    id,
    kind: "health-check",
    status: "pending",
    label: healthCheck.url ?? healthCheck.command?.command ?? id
  };
}

function toPlannedCommand(
  repositoryRoot: string,
  command: CommandStep,
  defaultWorkingDirectory = "."
): RuntimePlannedCommand {
  const workingDirectory = command.working_directory ?? defaultWorkingDirectory;

  return {
    id: command.id,
    command: command.command,
    args: command.args ?? [],
    cwd: join(repositoryRoot, workingDirectory),
    shell: command.shell ?? false,
    environment: command.environment ?? [],
    timeoutSeconds: command.timeout_seconds,
    optional: command.optional ?? false,
    optionalReason: command.optional_reason
  };
}

function createIncludedIdSet(only: string | undefined): ReadonlySet<string> | undefined {
  return only === undefined ? undefined : new Set([only]);
}

function isIncluded(id: string, includedIds: ReadonlySet<string> | undefined): boolean {
  return includedIds === undefined || includedIds.has(id);
}

function setupTitle(key: (typeof namedSetupOrder)[number]): string {
  return key.replaceAll("_", " ");
}
