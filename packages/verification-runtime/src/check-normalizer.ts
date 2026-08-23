import type {
  VerificationCheck,
  VerificationCheckSource,
  VerificationCheckSelectionReason,
  VerificationSelectionMode
} from "./types.js";

export type VerificationRuleLike = {
  readonly id: string;
  readonly description?: string;
  readonly paths?: readonly string[];
  readonly components?: readonly string[];
  readonly checks?: readonly VerificationCheckLike[];
  readonly commands?: readonly VerificationCommandLike[];
  readonly evidence?: readonly unknown[];
};

export type VerificationCheckLike = {
  readonly id: string;
  readonly kind?: string;
  readonly description?: string;
  readonly command: VerificationCommandLike;
  readonly paths?: readonly string[];
  readonly components?: readonly string[];
  readonly requires?: readonly string[];
  readonly evidence?: readonly unknown[];
};

export type VerificationCommandLike = {
  readonly id?: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly working_directory?: string;
  readonly shell?: boolean;
  readonly environment?: readonly string[];
  readonly timeout_seconds?: number;
  readonly requires?: readonly string[];
  readonly optional?: boolean;
  readonly optional_reason?: string;
  readonly description?: string;
  readonly evidence?: readonly unknown[];
};

export type NormalizeVerificationChecksInput = {
  readonly mode: VerificationSelectionMode;
  readonly defaultChecks?: readonly VerificationCheckLike[];
  readonly rules?: readonly VerificationRuleLike[];
};

export type NormalizeVerificationChecksResult = {
  readonly checks: readonly VerificationCheck[];
  readonly warnings: readonly string[];
};

export function normalizeVerificationChecks(
  input: NormalizeVerificationChecksInput
): NormalizeVerificationChecksResult {
  const checks: VerificationCheck[] = [];
  const warnings: string[] = [];

  for (const check of input.defaultChecks ?? []) {
    checks.push(toVerificationCheck(check, "default", undefined, undefined, "default"));
  }

  for (const rule of input.rules ?? []) {
    for (const check of rule.checks ?? []) {
      checks.push(
        toVerificationCheck(
          {
            ...check,
            paths: inheritList(check.paths, rule.paths),
            components: inheritList(check.components, rule.components)
          },
          "rule-check",
          rule.id,
          check.id,
          (rule.paths?.length ?? 0) > 0 ? "path" : "component"
        )
      );
    }

    for (const [index, command] of (rule.commands ?? []).entries()) {
      checks.push(
        toVerificationCheck(
          {
            id: command.id ?? `${rule.id}:command:${index}`,
            command,
            description: command.description ?? rule.description,
            paths: rule.paths,
            components: rule.components,
            requires: command.requires
          },
          "rule-command",
          rule.id,
          command.id ?? `${index}`,
          (rule.paths?.length ?? 0) > 0 ? "path" : "rule"
        )
      );
    }
  }

  return { checks, warnings };
}

function inheritList<T>(
  child: readonly T[] | undefined,
  parent: readonly T[] | undefined
): readonly T[] | undefined {
  return child === undefined || child.length === 0 ? parent : child;
}

function toVerificationCheck(
  input: VerificationCheckLike,
  source: VerificationCheckSource,
  ruleId: string | undefined,
  commandId: string | undefined,
  reasonKind: VerificationCheckSelectionReason["kind"]
): VerificationCheck {
  return {
    id: input.id,
    source,
    ruleId,
    commandId,
    description: input.description,
    command: {
      command: input.command.command,
      args: input.command.args ?? [],
      cwd: input.command.working_directory,
      shell: input.command.shell,
      timeoutSeconds: input.command.timeout_seconds,
      environment: input.command.environment ?? [],
      optional: input.command.optional
    },
    paths: input.paths ?? [],
    components: input.components ?? [],
    requires: input.requires ?? [],
    reason: {
      kind: reasonKind,
      details: ruleId === undefined ? [] : [ruleId]
    }
  };
}
