import { createDiagnosticFinding, type DiagnosticRule } from "./diagnostic-rule.js";
import type {
  LocalEnvironmentVariableObservation,
  LocalExpectedFileObservation,
  LocalToolObservation
} from "./local-environment.js";
import type { DiagnosticFinding } from "./types.js";

export function createEnvironmentDiagnosticRules(): readonly DiagnosticRule[] {
  return [environmentToolRule, environmentVariableRule, expectedFileRule];
}

export const environmentToolRule: DiagnosticRule = {
  id: "environment.tools",
  category: "environment",
  description: "Diagnose missing or unsupported local tools required by the contract.",
  prerequisites: ["local-environment"],
  run: (context) => ({
    findings: context.localEnvironment?.tools.flatMap((tool) => findingForTool(tool)) ?? [],
    warnings: []
  })
};

export const environmentVariableRule: DiagnosticRule = {
  id: "environment.variables",
  category: "environment",
  description: "Diagnose missing required environment variable names without reading values.",
  prerequisites: ["local-environment"],
  run: (context) => ({
    findings:
      context.localEnvironment?.environment.flatMap((variable) => findingForVariable(variable)) ??
      [],
    warnings: []
  })
};

export const expectedFileRule: DiagnosticRule = {
  id: "environment.expected-files",
  category: "environment",
  description: "Diagnose missing expected local metadata or lockfiles.",
  prerequisites: ["local-environment"],
  run: (context) => ({
    findings:
      context.localEnvironment?.expectedFiles.flatMap((file) => findingForExpectedFile(file)) ?? [],
    warnings: []
  })
};

function findingForTool(tool: LocalToolObservation): readonly DiagnosticFinding[] {
  if (tool.status !== "missing" && tool.status !== "unsupported") {
    return [];
  }

  const blocking = tool.required && tool.status === "missing";

  return [
    createDiagnosticFinding({
      id: `environment.tool.${tool.id}.${tool.status}`,
      ruleId: environmentToolRule.id,
      category: "environment",
      severity: blocking ? "blocking" : tool.required ? "error" : "warning",
      confidence: tool.status === "missing" ? "confirmed" : "high",
      title:
        tool.status === "missing"
          ? `${tool.command} is missing`
          : `${tool.command} version is unsupported`,
      summary:
        tool.status === "missing"
          ? `${tool.command} is required but was not available.`
          : `${tool.command} does not satisfy ${tool.versionRequirement ?? "the required version"}.`,
      evidence: [
        {
          kind: "command",
          summary: tool.summary,
          command: [tool.command, ...tool.args].join(" "),
          metadata: {
            required: tool.required,
            kind: tool.kind,
            ...(tool.parsedVersion === undefined ? {} : { parsedVersion: tool.parsedVersion }),
            ...(tool.versionRequirement === undefined
              ? {}
              : { versionRequirement: tool.versionRequirement })
          }
        }
      ],
      suggestedNextSteps: [`Install or configure ${tool.command}, then rerun board doctor.`]
    })
  ];
}

function findingForVariable(
  variable: LocalEnvironmentVariableObservation
): readonly DiagnosticFinding[] {
  if (variable.status !== "missing" || !variable.required) {
    return [];
  }

  return [
    createDiagnosticFinding({
      id: `environment.variable.${variable.name}.missing`,
      ruleId: environmentVariableRule.id,
      category: "environment",
      severity: "blocking",
      confidence: "confirmed",
      title: `${variable.name} is missing`,
      summary: `${variable.name} is required but is not set.`,
      evidence: [
        {
          kind: "environment",
          summary: variable.summary,
          metadata: {
            name: variable.name,
            required: variable.required,
            secret: variable.secret,
            usedBy: variable.usedBy.join(",")
          }
        }
      ],
      suggestedNextSteps: [`Set ${variable.name} in your local environment or env file.`]
    })
  ];
}

function findingForExpectedFile(file: LocalExpectedFileObservation): readonly DiagnosticFinding[] {
  if (file.status !== "missing") {
    return [];
  }

  return [
    createDiagnosticFinding({
      id: `environment.file.${sanitizeId(file.path)}.missing`,
      ruleId: expectedFileRule.id,
      category: "environment",
      severity: "warning",
      confidence: "medium",
      title: `${file.path} is missing`,
      summary: `${file.path} was expected for ${file.reason}.`,
      evidence: [
        {
          kind: "file",
          summary: `${file.path} is missing.`,
          path: file.path,
          metadata: {
            reason: file.reason
          }
        }
      ],
      suggestedNextSteps: [`Confirm whether ${file.path} should exist for local setup.`]
    })
  ];
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}
