import { z } from "zod";

export const repositoryTypeValues = [
  "service",
  "application",
  "library",
  "monorepo",
  "tooling",
  "unknown"
] as const;

export const languageValues = ["typescript", "javascript", "python", "go", "unknown"] as const;

export const reviewStatusValues = [
  "unknown",
  "human_authored",
  "scanner_detected",
  "model_inferred",
  "runtime_verified",
  "agent_proposed",
  "approval_required",
  "approved",
  "rejected"
] as const;

export const evidenceKindValues = [
  "source",
  "config",
  "test",
  "documentation",
  "runtime",
  "human",
  "model_inferred",
  "agent_proposed",
  "agent_validated"
] as const;

export const verificationStatusValues = [
  "unverified",
  "detected",
  "human_confirmed",
  "runtime_verified",
  "stale",
  "agent_proposed",
  "approval_required",
  "approved",
  "rejected"
] as const;

export const confidenceValues = ["low", "medium", "high"] as const;

export const applicationTypeValues = [
  "api",
  "frontend",
  "worker",
  "cli",
  "job",
  "service",
  "unknown"
] as const;

export const setupStepKindValues = [
  "install_dependencies",
  "build_containers",
  "start_services",
  "run_migrations",
  "seed_data",
  "generate_code",
  "health_check",
  "smoke_check",
  "custom"
] as const;

export const verificationCheckKindValues = [
  "default",
  "typecheck",
  "lint",
  "test",
  "api",
  "schema",
  "integration",
  "smoke",
  "build",
  "custom"
] as const;

export const serviceTypeValues = [
  "postgresql",
  "redis",
  "http_api",
  "message_queue",
  "object_storage",
  "container",
  "unknown"
] as const;

export const relationshipTypeValues = [
  "consumes_api",
  "provides_api",
  "publishes_event",
  "consumes_event",
  "shared_package",
  "deploys_with",
  "unknown"
] as const;

export const relationshipDirectionValues = [
  "inbound",
  "outbound",
  "bidirectional",
  "unknown"
] as const;

export const repositoryProviderValues = [
  "github",
  "gitlab",
  "bitbucket",
  "azure_devops",
  "self_hosted",
  "unknown"
] as const;

export const externalSystemTypeValues = [
  "http_api",
  "database",
  "message_queue",
  "object_storage",
  "identity_provider",
  "payment_provider",
  "analytics",
  "observability",
  "unknown"
] as const;

export const knownLimitationStatusValues = [
  "active",
  "resolved",
  "unverified",
  "accepted"
] as const;

export const agentTraceMetadataSchema = z
  .object({
    agent_run_id: z.string().min(1).optional(),
    tool_call_id: z.string().min(1).optional(),
    proposal_id: z.string().min(1).optional(),
    approval_id: z.string().min(1).optional()
  })
  .strict();

export const fieldMetadataSchema = agentTraceMetadataSchema
  .extend({
    source: z
      .enum(["human", "scanner", "model", "runtime", "agent", "unknown"])
      .default("unknown")
      .optional(),
    review_status: z.enum(reviewStatusValues).default("unknown").optional(),
    review_required: z.boolean().default(false).optional()
  })
  .strict();

export const contractMetadataSchema = agentTraceMetadataSchema
  .extend({
    source: z
      .enum(["human", "scanner", "model", "runtime", "agent", "unknown"])
      .default("unknown")
      .optional(),
    review_status: z.enum(reviewStatusValues).default("unknown").optional(),
    review_required: z.boolean().default(false).optional(),
    notes: z.string().min(1).optional()
  })
  .strict();

export const maintenanceMetadataSchema = z
  .object({
    maintained_by: z.array(z.string().min(1)).default([]).optional(),
    last_agent_update: z.string().datetime({ offset: true }).optional(),
    last_human_review: z.string().datetime({ offset: true }).optional(),
    review_required: z.boolean().default(false).optional(),
    notes: z.string().min(1).optional()
  })
  .strict();

export const reviewedTextSchema = z
  .object({
    value: z.string().min(1),
    metadata: fieldMetadataSchema.optional()
  })
  .strict();

export const repositoryPurposeSchema = z.union([z.string().min(1), reviewedTextSchema]);

export const evidenceSchema = z
  .object({
    kind: z.enum(evidenceKindValues),
    source_path: z.string().min(1).optional(),
    line_start: z.number().int().positive().optional(),
    line_end: z.number().int().positive().optional(),
    command: z.string().min(1).optional(),
    commit_sha: z.string().min(1).optional(),
    detector: z.string().min(1).optional(),
    confidence: z.enum(confidenceValues).optional(),
    observed_at: z.string().datetime({ offset: true }).optional(),
    verification_status: z.enum(verificationStatusValues).default("unverified").optional(),
    notes: z.string().min(1).optional()
  })
  .strict()
  .superRefine((evidence, context) => {
    if (
      evidence.line_start !== undefined &&
      evidence.line_end !== undefined &&
      evidence.line_end < evidence.line_start
    ) {
      context.addIssue({
        code: "custom",
        path: ["line_end"],
        message: "line_end must be greater than or equal to line_start"
      });
    }

    if (
      ["source", "config", "test", "documentation"].includes(evidence.kind) &&
      evidence.source_path === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["source_path"],
        message: `source_path is required for ${evidence.kind} evidence`
      });
    }

    if (evidence.kind === "runtime" && evidence.command === undefined) {
      context.addIssue({
        code: "custom",
        path: ["command"],
        message: "command is required for runtime evidence"
      });
    }
  });

export const commandStepSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9_-]*$/, {
        message: "command id must use lowercase letters, numbers, underscores, or hyphens"
      })
      .optional(),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    working_directory: z.string().min(1).optional(),
    shell: z.boolean().optional(),
    environment: z.array(z.string().min(1)).default([]).optional(),
    timeout_seconds: z.number().int().positive().optional(),
    requires: z.array(z.string().min(1)).default([]).optional(),
    optional: z.boolean().default(false).optional(),
    optional_reason: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    evidence: z.array(evidenceSchema).default([]).optional()
  })
  .strict()
  .superRefine((command, context) => {
    if (command.optional === true && command.optional_reason === undefined) {
      context.addIssue({
        code: "custom",
        path: ["optional_reason"],
        message: "optional_reason is required when a command is optional"
      });
    }
  });

export const healthCheckSchema = z
  .object({
    url: z.string().url().optional(),
    command: commandStepSchema.optional(),
    evidence: z.array(evidenceSchema).default([]).optional()
  })
  .strict()
  .refine((healthCheck) => healthCheck.url !== undefined || healthCheck.command !== undefined, {
    message: "health_check requires either url or command"
  });

export const applicationSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9_-]*$/, {
        message: "application id must use lowercase letters, numbers, underscores, or hyphens"
      }),
    name: z.string().min(1).optional(),
    type: z.enum(applicationTypeValues),
    working_directory: z.string().min(1).default(".").optional(),
    entrypoint: z.string().min(1).optional(),
    start: commandStepSchema.optional(),
    dev: commandStepSchema.optional(),
    build: commandStepSchema.optional(),
    health_check: healthCheckSchema.optional(),
    ports: z.array(z.number().int().positive().max(65535)).default([]).optional(),
    depends_on: z.array(z.string().min(1)).default([]).optional(),
    environment: z.array(z.string().min(1)).default([]).optional(),
    evidence: z.array(evidenceSchema).default([]).optional()
  })
  .strict();

export const applicationsSchema = z
  .record(z.string().min(1), applicationSchema)
  .superRefine((applications, context) => {
    for (const [key, application] of Object.entries(applications)) {
      if (application.id !== key) {
        context.addIssue({
          code: "custom",
          path: [key, "id"],
          message: "application id must match its applications map key"
        });
      }
    }
  });

export const serviceSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9_-]*$/, {
        message: "service id must use lowercase letters, numbers, underscores, or hyphens"
      }),
    name: z.string().min(1).optional(),
    type: z.enum(serviceTypeValues),
    compose_service: z.string().min(1).optional(),
    image: z.string().min(1).optional(),
    ports: z.array(z.number().int().positive().max(65535)).default([]).optional(),
    health_check: healthCheckSchema.optional(),
    required: z.boolean().default(true).optional(),
    optional_reason: z.string().min(1).optional(),
    environment: z.array(z.string().min(1)).default([]).optional(),
    volumes: z.array(z.string().min(1)).default([]).optional(),
    evidence: z.array(evidenceSchema).default([]).optional()
  })
  .strict()
  .superRefine((service, context) => {
    if (service.required === false && service.optional_reason === undefined) {
      context.addIssue({
        code: "custom",
        path: ["optional_reason"],
        message: "optional_reason is required when a service is not required"
      });
    }
  });

export const servicesSchema = z
  .record(z.string().min(1), serviceSchema)
  .superRefine((services, context) => {
    for (const [key, service] of Object.entries(services)) {
      if (service.id !== key) {
        context.addIssue({
          code: "custom",
          path: [key, "id"],
          message: "service id must match its services map key"
        });
      }
    }
  });

const safeSecretPlaceholderValues = new Set([
  "<redacted>",
  "<secret>",
  "<token>",
  "<password>",
  "redacted",
  "replace-me",
  "placeholder"
]);

function looksLikeSecret(value: string): boolean {
  return (
    /\b(sk|pk|ghp|github_pat|xox[baprs]|glpat)-[A-Za-z0-9_-]{10,}\b/.test(value) ||
    /\bAKIA[0-9A-Z]{16}\b/.test(value) ||
    /[A-Za-z0-9+/=_-]{32,}/.test(value)
  );
}

export const environmentVariableSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(/^[A-Z][A-Z0-9_]*$/, {
        message: "environment variable name must use uppercase letters, numbers, and underscores"
      }),
    required: z.boolean().default(false).optional(),
    description: z.string().min(1).optional(),
    used_by: z.array(z.string().min(1)).default([]).optional(),
    secret: z.boolean().default(false).optional(),
    default_for_local: z.string().min(1).optional(),
    example_value: z.string().min(1).optional(),
    source: z.enum(["human", "scanner", "model", "runtime", "agent", "unknown"]).optional(),
    evidence: z.array(evidenceSchema).default([]).optional()
  })
  .strict()
  .superRefine((variable, context) => {
    if (variable.secret === true && variable.default_for_local !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["default_for_local"],
        message: "secret variables must not store default_for_local values"
      });
    }

    if (variable.example_value !== undefined) {
      const normalizedExampleValue = variable.example_value.trim().toLowerCase();
      const isSafePlaceholder = safeSecretPlaceholderValues.has(normalizedExampleValue);

      if (variable.secret === true && !isSafePlaceholder) {
        context.addIssue({
          code: "custom",
          path: ["example_value"],
          message: "secret variables may only use safe placeholder example values"
        });
      }

      if (!isSafePlaceholder && looksLikeSecret(variable.example_value)) {
        context.addIssue({
          code: "custom",
          path: ["example_value"],
          message: "example_value looks like a secret and must not be stored in the contract"
        });
      }
    }
  });

export const environmentSchema = z
  .record(z.string().min(1), environmentVariableSchema)
  .superRefine((variables, context) => {
    for (const [key, variable] of Object.entries(variables)) {
      if (variable.name !== key) {
        context.addIssue({
          code: "custom",
          path: [key, "name"],
          message: "environment variable name must match its environment map key"
        });
      }
    }
  });

export const setupStepSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9_-]*$/, {
        message: "setup step id must use lowercase letters, numbers, underscores, or hyphens"
      }),
    name: z.string().min(1).optional(),
    kind: z.enum(setupStepKindValues),
    command: commandStepSchema,
    depends_on: z.array(z.string().min(1)).default([]).optional(),
    optional: z.boolean().default(false).optional(),
    optional_reason: z.string().min(1).optional(),
    evidence: z.array(evidenceSchema).default([]).optional()
  })
  .strict()
  .superRefine((step, context) => {
    if (step.optional === true && step.optional_reason === undefined) {
      context.addIssue({
        code: "custom",
        path: ["optional_reason"],
        message: "optional_reason is required when a setup step is optional"
      });
    }
  });

export const setupSchema = z
  .object({
    install: commandStepSchema.optional(),
    build_containers: commandStepSchema.optional(),
    start_services: commandStepSchema.optional(),
    migrate: commandStepSchema.optional(),
    seed: commandStepSchema.optional(),
    generate: commandStepSchema.optional(),
    health_check: commandStepSchema.optional(),
    smoke_check: commandStepSchema.optional(),
    steps: z.array(setupStepSchema).default([]).optional()
  })
  .strict()
  .superRefine((setup, context) => {
    const stepIds = new Set((setup.steps ?? []).map((step) => step.id));
    const seenStepIds = new Set<string>();

    for (const [index, step] of (setup.steps ?? []).entries()) {
      if (seenStepIds.has(step.id)) {
        context.addIssue({
          code: "custom",
          path: ["steps", index, "id"],
          message: `Duplicate setup step id: ${step.id}`
        });
      }

      seenStepIds.add(step.id);

      for (const dependencyId of step.depends_on ?? []) {
        if (!stepIds.has(dependencyId)) {
          context.addIssue({
            code: "custom",
            path: ["steps", index, "depends_on"],
            message: `Unknown setup step dependency: ${dependencyId}`
          });
        }
      }
    }
  });

const pathPatternSchema = z
  .string()
  .min(1)
  .refine((pattern) => pattern.trim() === pattern, {
    message: "path pattern must not have leading or trailing whitespace"
  })
  .refine((pattern) => !pattern.startsWith("/"), {
    message: "path pattern must be relative to the repository root"
  })
  .refine((pattern) => !/^[A-Za-z]:[\\/]/.test(pattern), {
    message: "path pattern must be relative to the repository root"
  })
  .refine((pattern) => !pattern.includes("\0"), {
    message: "path pattern must not contain null bytes"
  });

function isRelativeRepositoryPath(path: string): boolean {
  return (
    path.trim() === path &&
    path.length > 0 &&
    !path.startsWith("/") &&
    !/^[A-Za-z]:[\\/]/.test(path) &&
    !path.includes("\0")
  );
}

export const verificationCheckSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9_-]*$/, {
        message:
          "verification check id must use lowercase letters, numbers, underscores, or hyphens"
      }),
    kind: z.enum(verificationCheckKindValues).default("custom").optional(),
    command: commandStepSchema,
    description: z.string().min(1).optional(),
    paths: z.array(pathPatternSchema).default([]).optional(),
    components: z.array(z.string().min(1)).default([]).optional(),
    expected_output: z.string().min(1).optional(),
    success_condition: z.string().min(1).optional(),
    evidence: z.array(evidenceSchema).default([]).optional()
  })
  .strict();

export const verificationRuleSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9_-]*$/, {
        message: "verification rule id must use lowercase letters, numbers, underscores, or hyphens"
      }),
    description: z.string().min(1).optional(),
    paths: z.array(pathPatternSchema).default([]).optional(),
    components: z.array(z.string().min(1)).default([]).optional(),
    checks: z.array(verificationCheckSchema).min(1).optional(),
    commands: z.array(commandStepSchema).min(1).optional(),
    evidence: z.array(evidenceSchema).default([]).optional()
  })
  .strict()
  .refine(
    (rule) =>
      (rule.paths !== undefined && rule.paths.length > 0) ||
      (rule.components !== undefined && rule.components.length > 0),
    {
      message: "verification rule requires paths or components"
    }
  )
  .refine(
    (rule) =>
      (rule.checks !== undefined && rule.checks.length > 0) ||
      (rule.commands !== undefined && rule.commands.length > 0),
    {
      message: "verification rule requires checks or commands"
    }
  );

export const verificationSchema = z
  .object({
    default: z.array(verificationCheckSchema).default([]).optional(),
    rules: z.array(verificationRuleSchema).default([]).optional()
  })
  .strict();

export const pathRuleSchema = z
  .object({
    pattern: pathPatternSchema,
    description: z.string().min(1).optional(),
    evidence: z.array(evidenceSchema).default([]).optional()
  })
  .strict();

export const generatedPathSchema = pathRuleSchema
  .extend({
    generated_by: commandStepSchema.optional(),
    source_paths: z.array(pathPatternSchema).default([]).optional()
  })
  .strict();

export const sensitivePathSchema = pathRuleSchema
  .extend({
    risk: z.string().min(1),
    handling: z.string().min(1).optional()
  })
  .strict();

export const unsafePathSchema = pathRuleSchema
  .extend({
    reason: z.string().min(1),
    edit_instead: z.string().min(1)
  })
  .strict();

export const sourceOfTruthPathSchema = pathRuleSchema
  .extend({
    governs: z.array(pathPatternSchema).min(1)
  })
  .strict();

export const relatedRepositorySchema = z
  .object({
    name: z.string().min(1),
    provider: z.enum(repositoryProviderValues).default("unknown").optional(),
    repository_url: z.string().url().optional(),
    repository_slug: z.string().min(1).optional(),
    relationship: z.enum(relationshipTypeValues),
    direction: z.enum(relationshipDirectionValues),
    notes: z.string().min(1).optional(),
    evidence: z.array(evidenceSchema).default([]).optional()
  })
  .strict()
  .refine(
    (repository) =>
      repository.repository_url !== undefined || repository.repository_slug !== undefined,
    {
      path: ["repository_slug"],
      message: "related repository requires repository_url or repository_slug"
    }
  );

export const relatedRepositoriesSchema = z.array(relatedRepositorySchema).default([]).optional();

export const externalSystemSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9_-]*$/, {
        message: "external system id must use lowercase letters, numbers, underscores, or hyphens"
      }),
    name: z.string().min(1),
    type: z.enum(externalSystemTypeValues),
    relationship: z.enum(relationshipTypeValues).default("unknown").optional(),
    direction: z.enum(relationshipDirectionValues).default("outbound").optional(),
    endpoint: z.string().url().optional(),
    description: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
    evidence: z.array(evidenceSchema).default([]).optional()
  })
  .strict();

export const externalSystemsSchema = z
  .array(externalSystemSchema)
  .default([])
  .optional()
  .superRefine((systems, context) => {
    const seenIds = new Set<string>();

    for (const [index, system] of (systems ?? []).entries()) {
      if (seenIds.has(system.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `Duplicate external system id: ${system.id}`
        });
      }

      seenIds.add(system.id);
    }
  });

export const knownLimitationSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9_-]*$/, {
        message: "known limitation id must use lowercase letters, numbers, underscores, or hyphens"
      }),
    summary: z.string().min(1),
    impact: z.string().min(1),
    applies_to: z.array(z.string().min(1)).default([]).optional(),
    workaround: z.string().min(1).optional(),
    status: z.enum(knownLimitationStatusValues),
    last_verified: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: "last_verified must use YYYY-MM-DD format"
      })
      .optional(),
    evidence: z.array(evidenceSchema).default([]).optional()
  })
  .strict();

export const knownLimitationsSchema = z
  .array(knownLimitationSchema)
  .default([])
  .optional()
  .superRefine((limitations, context) => {
    const seenIds = new Set<string>();

    for (const [index, limitation] of (limitations ?? []).entries()) {
      if (seenIds.has(limitation.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `Duplicate known limitation id: ${limitation.id}`
        });
      }

      seenIds.add(limitation.id);
    }
  });

export const repositorySectionSchema = z
  .object({
    name: z.string().min(1, "repository.name is required"),
    purpose: repositoryPurposeSchema.optional(),
    type: z.enum(repositoryTypeValues),
    primary_language: z.enum(languageValues),
    languages: z.array(z.enum(languageValues)).default([]).optional(),
    root: z.string().min(1).default(".").optional(),
    owners: z.array(z.string().min(1)).default([]).optional(),
    description: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).default([]).optional(),
    metadata: fieldMetadataSchema.optional()
  })
  .strict();

export const repositoryContractSchema = z
  .object({
    version: z.literal(1),
    repository: repositorySectionSchema,
    metadata: contractMetadataSchema.optional(),
    maintenance: maintenanceMetadataSchema.optional(),
    applications: applicationsSchema.default({}).optional(),
    services: servicesSchema.default({}).optional(),
    environment: environmentSchema.default({}).optional(),
    setup: setupSchema.default({}).optional(),
    verification: verificationSchema.default({}).optional(),
    generated_files: z.array(generatedPathSchema).default([]).optional(),
    sensitive_paths: z.array(sensitivePathSchema).default([]).optional(),
    unsafe_paths: z.array(unsafePathSchema).default([]).optional(),
    source_of_truth_paths: z.array(sourceOfTruthPathSchema).default([]).optional(),
    related_repositories: relatedRepositoriesSchema,
    external_systems: externalSystemsSchema,
    known_limitations: knownLimitationsSchema
  })
  .strict()
  .superRefine((contract, context) => {
    const applicationIds = new Set(Object.keys(contract.applications ?? {}));
    const serviceIds = new Set(Object.keys(contract.services ?? {}));
    const environmentNames = new Set(Object.keys(contract.environment ?? {}));

    if (!isRelativeRepositoryPath(contract.repository.root ?? ".")) {
      context.addIssue({
        code: "custom",
        path: ["repository", "root"],
        message: "repository root must be relative to the repository root"
      });
    }

    for (const applicationId of applicationIds) {
      if (serviceIds.has(applicationId)) {
        context.addIssue({
          code: "custom",
          path: ["applications", applicationId, "id"],
          message: `Duplicate component id across applications and services: ${applicationId}`
        });
      }
    }

    for (const [applicationId, application] of Object.entries(contract.applications ?? {})) {
      if (!isRelativeRepositoryPath(application.working_directory ?? ".")) {
        context.addIssue({
          code: "custom",
          path: ["applications", applicationId, "working_directory"],
          message: "application working_directory must be relative to the repository root"
        });
      }

      for (const dependencyId of application.depends_on ?? []) {
        if (!applicationIds.has(dependencyId) && !serviceIds.has(dependencyId)) {
          context.addIssue({
            code: "custom",
            path: ["applications", applicationId, "depends_on"],
            message: `Unknown application or service dependency: ${dependencyId}`
          });
        }
      }

      for (const variableName of application.environment ?? []) {
        if (!environmentNames.has(variableName)) {
          context.addIssue({
            code: "custom",
            path: ["applications", applicationId, "environment"],
            message: `Unknown environment variable: ${variableName}`
          });
        }
      }
    }

    for (const [serviceId, service] of Object.entries(contract.services ?? {})) {
      for (const variableName of service.environment ?? []) {
        if (!environmentNames.has(variableName)) {
          context.addIssue({
            code: "custom",
            path: ["services", serviceId, "environment"],
            message: `Unknown environment variable: ${variableName}`
          });
        }
      }
    }

    for (const [ruleIndex, rule] of (contract.verification?.rules ?? []).entries()) {
      for (const componentId of rule.components ?? []) {
        if (!applicationIds.has(componentId) && !serviceIds.has(componentId)) {
          context.addIssue({
            code: "custom",
            path: ["verification", "rules", ruleIndex, "components"],
            message: `Unknown verification component: ${componentId}`
          });
        }
      }

      for (const [checkIndex, check] of (rule.checks ?? []).entries()) {
        for (const componentId of check.components ?? []) {
          if (!applicationIds.has(componentId) && !serviceIds.has(componentId)) {
            context.addIssue({
              code: "custom",
              path: ["verification", "rules", ruleIndex, "checks", checkIndex, "components"],
              message: `Unknown verification component: ${componentId}`
            });
          }
        }
      }
    }

    for (const [setupField, command] of Object.entries({
      install: contract.setup?.install,
      build_containers: contract.setup?.build_containers,
      start_services: contract.setup?.start_services,
      migrate: contract.setup?.migrate,
      seed: contract.setup?.seed,
      generate: contract.setup?.generate,
      health_check: contract.setup?.health_check,
      smoke_check: contract.setup?.smoke_check
    })) {
      if (
        command?.working_directory !== undefined &&
        !isRelativeRepositoryPath(command.working_directory)
      ) {
        context.addIssue({
          code: "custom",
          path: ["setup", setupField, "working_directory"],
          message: "setup command working_directory must be relative to the repository root"
        });
      }
    }
  });
