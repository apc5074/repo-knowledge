import { parseDocument } from "yaml";

import type { RepositoryDetector, ScanWarning } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { createEvidenceFromLocation, findStringLocation } from "./source-location.js";

const detectorName = "github-actions";

export type GitHubActionsJob = {
  readonly id: string;
  readonly name?: string;
  readonly setupActions: readonly string[];
  readonly commands: readonly string[];
  readonly languageVersions: Readonly<Record<string, string>>;
};

export type GitHubActionsWorkflow = {
  readonly path: string;
  readonly name?: string;
  readonly triggers: readonly string[];
  readonly jobs: readonly GitHubActionsJob[];
};

export type ParseGitHubActionsWorkflowResult =
  | { readonly ok: true; readonly workflow: GitHubActionsWorkflow }
  | { readonly ok: false; readonly warning: ScanWarning };

export function parseGitHubActionsWorkflow(
  path: string,
  text: string
): ParseGitHubActionsWorkflowResult {
  const document = parseDocument(text, {
    prettyErrors: false
  });

  if (document.errors.length > 0) {
    return {
      ok: false,
      warning: {
        detector: detectorName,
        path,
        message: `Could not parse ${path}: ${document.errors[0]?.message ?? "invalid YAML"}`
      }
    };
  }

  const root = document.toJSON() as Record<string, unknown> | null;
  const workflow = root && typeof root === "object" ? root : {};

  return {
    ok: true,
    workflow: {
      path,
      name: stringValue(workflow.name),
      triggers: triggerNames(workflow.on),
      jobs: parseJobs(workflow.jobs)
    }
  };
}

export function createGitHubActionsDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["ci.workflow_detected", "command.detected"],
    filePatterns: [".github/workflows/*.yml", ".github/workflows/*.yaml"],
    run: async (context) => {
      const facts: ScannerFact[] = [];
      const warnings: ScanWarning[] = [];

      for (const path of context.inventory.files.filter(isWorkflowPath)) {
        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        const parsed = parseGitHubActionsWorkflow(path, result.text);

        if (!parsed.ok) {
          warnings.push(parsed.warning);
          continue;
        }

        facts.push(...workflowFacts(parsed.workflow, result.text));
      }

      return {
        facts,
        warnings,
        stats: {
          files_considered: context.inventory.files.length,
          facts_emitted: facts.length
        }
      };
    }
  };
}

function workflowFacts(workflow: GitHubActionsWorkflow, text: string): readonly ScannerFact[] {
  const facts: ScannerFact[] = [
    createScannerFact({
      kind: "ci.workflow_detected",
      value: {
        path: workflow.path,
        name: workflow.name,
        triggers: workflow.triggers,
        jobs: workflow.jobs
      },
      confidence: "high",
      detector: detectorName,
      evidence: [
        createEvidenceFromLocation({
          kind: "config",
          sourcePath: workflow.path,
          detector: detectorName,
          location: findStringLocation(text, "jobs:") ?? { line_start: 1, line_end: 1 }
        })
      ]
    })
  ];

  for (const job of workflow.jobs) {
    for (const command of job.commands) {
      const category = commandCategory(command);

      if (!category) {
        continue;
      }

      facts.push(
        createScannerFact({
          kind: "command.detected",
          value: {
            name: `${job.id}:${category}`,
            command,
            category,
            cwd: ".",
            source: "github-actions",
            workflow: workflow.path,
            job: job.id
          },
          confidence: "high",
          detector: detectorName,
          evidence: [
            createEvidenceFromLocation({
              kind: "config",
              sourcePath: workflow.path,
              detector: detectorName,
              location: findStringLocation(text, command) ?? { line_start: 1, line_end: 1 }
            })
          ]
        })
      );
    }
  }

  return facts;
}

function parseJobs(value: unknown): readonly GitHubActionsJob[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value)
    .map(([id, job]) => parseJob(id, job))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function parseJob(id: string, value: unknown): GitHubActionsJob {
  const job = isRecord(value) ? value : {};
  const steps = Array.isArray(job.steps) ? job.steps : [];
  const setupActions: string[] = [];
  const commands: string[] = [];
  const languageVersions: Record<string, string> = {};

  for (const step of steps) {
    if (!isRecord(step)) {
      continue;
    }

    const uses = stringValue(step.uses);

    if (uses && isSetupAction(uses)) {
      setupActions.push(uses);
      Object.assign(languageVersions, setupActionVersions(uses, step.with));
    }

    const run = stringValue(step.run);

    if (run) {
      commands.push(run);
    }
  }

  return {
    id,
    name: stringValue(job.name),
    setupActions: [...new Set(setupActions)].sort(),
    commands,
    languageVersions
  };
}

function triggerNames(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.map(String).sort();
  }

  if (isRecord(value)) {
    return Object.keys(value).sort();
  }

  return [];
}

function setupActionVersions(uses: string, value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    return {};
  }

  const versions: Record<string, string> = {};

  if (/actions\/setup-node/i.test(uses)) {
    const version = stringValue(value["node-version"]);

    if (version) {
      versions.node = version;
    }
  }

  if (/actions\/setup-python/i.test(uses)) {
    const version = stringValue(value["python-version"]);

    if (version) {
      versions.python = version;
    }
  }

  if (/actions\/setup-go/i.test(uses)) {
    const version = stringValue(value["go-version"]);

    if (version) {
      versions.go = version;
    }
  }

  return versions;
}

function commandCategory(command: string): string | undefined {
  if (/\b(test|pytest|vitest|jest)\b/i.test(command)) {
    return "test";
  }

  if (/\b(lint|eslint|ruff check)\b/i.test(command)) {
    return "lint";
  }

  if (/\b(typecheck|tsc|mypy|pyright)\b/i.test(command)) {
    return "typecheck";
  }

  if (/\b(build|next build|vite build)\b/i.test(command)) {
    return "build";
  }

  return undefined;
}

function isWorkflowPath(path: string): boolean {
  return /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path);
}

function isSetupAction(value: string): boolean {
  return /actions\/setup-(?:node|python|go)/i.test(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
