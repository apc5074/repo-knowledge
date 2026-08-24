import type { CommandStep, RepositoryContract } from "@repo-knowledge/repository-contract";

import {
  createDiagnosticFinding,
  type DiagnosticRule,
  type RepositoryReference,
  type RepositoryReferenceInventory
} from "./diagnostic-rule.js";
import type { DiagnosticFinding } from "./types.js";

export function createContractReferenceDiagnosticRules(): readonly DiagnosticRule[] {
  return [
    contractLoaderFindingRule,
    contractPathReferenceRule,
    contractCommandReferenceRule,
    documentationReferenceRule
  ];
}

export const contractLoaderFindingRule: DiagnosticRule = {
  id: "contract.loader-findings",
  category: "contract",
  description: "Expose contract loader diagnostics as rule findings.",
  prerequisites: [],
  run: (context) => ({
    findings: context.repository.findings,
    warnings: []
  })
};

export const contractPathReferenceRule: DiagnosticRule = {
  id: "contract.path-references",
  category: "contract",
  description: "Detect contract path references that do not match repository inventory.",
  prerequisites: ["contract", "repository-inventory"],
  run: (context) => ({
    findings:
      context.repository.contract === undefined || context.repositoryInventory === undefined
        ? []
        : missingContractPathFindings(
            context.repository.contract,
            context.repositoryInventory.paths
          ),
    warnings: []
  })
};

export const contractCommandReferenceRule: DiagnosticRule = {
  id: "contract.command-references",
  category: "contract",
  description: "Detect setup, generated, and verification commands not found in inventory.",
  prerequisites: ["contract", "repository-inventory"],
  run: (context) => ({
    findings:
      context.repository.contract === undefined || context.repositoryInventory === undefined
        ? []
        : missingCommandFindings(context.repository.contract, context.repositoryInventory.commands),
    warnings: []
  })
};

export const documentationReferenceRule: DiagnosticRule = {
  id: "docs.stale-references",
  category: "docs",
  description: "Detect documentation or agent-instruction references to missing paths or commands.",
  prerequisites: ["repository-inventory"],
  run: (context) => ({
    findings:
      context.repositoryInventory === undefined
        ? []
        : [
            ...staleReferenceFindings(
              context.repositoryInventory.documentationReferences ?? [],
              context.repositoryInventory
            ),
            ...staleReferenceFindings(
              context.repositoryInventory.agentInstructionReferences ?? [],
              context.repositoryInventory
            )
          ],
    warnings: []
  })
};

function missingContractPathFindings(
  contract: RepositoryContract,
  paths: readonly string[]
): readonly DiagnosticFinding[] {
  const references = [
    ...(contract.generated_files ?? []).flatMap((rule) => [
      { kind: "generated_files", value: rule.pattern },
      ...(rule.source_paths ?? []).map((value) => ({
        kind: "generated_files.source_paths",
        value
      }))
    ]),
    ...(contract.source_of_truth_paths ?? []).map((rule) => ({
      kind: "source_of_truth_paths",
      value: rule.pattern
    })),
    ...(contract.unsafe_paths ?? []).map((rule) => ({ kind: "unsafe_paths", value: rule.pattern })),
    ...(contract.sensitive_paths ?? []).map((rule) => ({
      kind: "sensitive_paths",
      value: rule.pattern
    }))
  ];

  return references.flatMap((reference) =>
    matchesAnyPath(reference.value, paths)
      ? []
      : [
          createDiagnosticFinding({
            id: `contract.path.${sanitizeId(reference.kind)}.${sanitizeId(reference.value)}.missing`,
            ruleId: contractPathReferenceRule.id,
            category: "contract",
            severity: "warning",
            confidence: "medium",
            title: "Contract references a missing path",
            summary: `${reference.kind} references ${reference.value}, but no matching repository path was found.`,
            evidence: [
              {
                kind: "contract",
                summary: `Missing contract path reference ${reference.value}.`,
                metadata: {
                  section: reference.kind,
                  value: reference.value
                }
              }
            ],
            counterEvidence: [
              {
                kind: "file",
                summary:
                  "Pattern matching uses repository inventory and can miss generated or ignored paths."
              }
            ],
            suggestedNextSteps: [`Review contract reference ${reference.value}.`]
          })
        ]
  );
}

function missingCommandFindings(
  contract: RepositoryContract,
  commands: readonly string[]
): readonly DiagnosticFinding[] {
  const known = new Set(commands);

  return collectContractCommands(contract).flatMap((entry) => {
    const commandName = normalizeCommandName(entry.command.command);

    return known.has(commandName)
      ? []
      : [
          createDiagnosticFinding({
            id: `contract.command.${sanitizeId(entry.id)}.${sanitizeId(commandName)}.missing`,
            ruleId: contractCommandReferenceRule.id,
            category: "contract",
            severity: "warning",
            confidence: "medium",
            title: "Contract references a missing command",
            summary: `${entry.id} references command ${commandName}, but scanner inventory did not find it.`,
            evidence: [
              {
                kind: "contract",
                summary: `Missing command reference ${commandName}.`,
                command: commandName,
                metadata: {
                  commandId: entry.id
                }
              }
            ],
            counterEvidence: [
              {
                kind: "command",
                summary:
                  "Command inventory is deterministic but may not include globally installed tools."
              }
            ],
            suggestedNextSteps: [
              `Review command ${entry.id} or ensure ${commandName} is documented.`
            ]
          })
        ];
  });
}

function staleReferenceFindings(
  references: readonly RepositoryReference[],
  inventory: RepositoryReferenceInventory
): readonly DiagnosticFinding[] {
  return references.flatMap((reference) => {
    const active =
      reference.kind === "path"
        ? matchesAnyPath(reference.value, inventory.paths)
        : reference.kind === "command"
          ? inventory.commands.includes(reference.value)
          : true;

    return active
      ? []
      : [
          createDiagnosticFinding({
            id: `docs.reference.${sanitizeId(reference.sourcePath)}.${sanitizeId(reference.value)}.missing`,
            ruleId: documentationReferenceRule.id,
            category: "docs",
            severity: "warning",
            confidence: "medium",
            title: "Documentation references a missing item",
            summary: `${reference.sourcePath} references ${reference.value}, but it was not found in repository inventory.`,
            evidence: [
              {
                kind: "file",
                summary: `Missing ${reference.kind} reference ${reference.value}.`,
                path: reference.sourcePath,
                line: reference.line,
                metadata: {
                  referenceKind: reference.kind,
                  value: reference.value
                }
              }
            ],
            counterEvidence: [
              {
                kind: "file",
                summary: "Documentation references can point to external commands or future paths."
              }
            ],
            suggestedNextSteps: [`Review ${reference.sourcePath} reference ${reference.value}.`]
          })
        ];
  });
}

function collectContractCommands(
  contract: RepositoryContract
): readonly { readonly id: string; readonly command: CommandStep }[] {
  return [
    ...Object.entries({
      "setup.install": contract.setup?.install,
      "setup.build_containers": contract.setup?.build_containers,
      "setup.start_services": contract.setup?.start_services,
      "setup.migrate": contract.setup?.migrate,
      "setup.seed": contract.setup?.seed,
      "setup.generate": contract.setup?.generate,
      "setup.health_check": contract.setup?.health_check,
      "setup.smoke_check": contract.setup?.smoke_check
    }).flatMap(([id, command]) => (command === undefined ? [] : [{ id, command }])),
    ...(contract.setup?.steps ?? []).map((step) => ({
      id: `setup.steps.${step.id}`,
      command: step.command
    })),
    ...(contract.verification?.default ?? []).map((check) => ({
      id: `verification.default.${check.id}`,
      command: check.command
    })),
    ...(contract.verification?.rules ?? []).flatMap((rule) => [
      ...(rule.checks ?? []).map((check) => ({
        id: `verification.rules.${rule.id}.${check.id}`,
        command: check.command
      })),
      ...(rule.commands ?? []).map((command, index) => ({
        id: `verification.rules.${rule.id}.commands.${index}`,
        command
      }))
    ]),
    ...(contract.generated_files ?? []).flatMap((rule, index) =>
      rule.generated_by === undefined
        ? []
        : [{ id: `generated_files.${index}.generated_by`, command: rule.generated_by }]
    )
  ];
}

function normalizeCommandName(command: string): string {
  const first = command.trim().split(/\s+/)[0] ?? command;
  const parts = first.split(/[\\/]/);
  return parts[parts.length - 1] ?? first;
}

function matchesAnyPath(pattern: string, paths: readonly string[]): boolean {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return paths.some((path) => path === prefix || path.startsWith(`${prefix}/`));
  }

  if (pattern.includes("*")) {
    const regex = new RegExp(`^${escapeRegex(pattern).replaceAll("\\*", ".*")}$`);
    return paths.some((path) => regex.test(path));
  }

  return paths.includes(pattern);
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}
