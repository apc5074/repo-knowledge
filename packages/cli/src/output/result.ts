import type { CommandContext } from "../command-context.js";

export type CommandResultStatus = "success" | "warning" | "failure" | "not-implemented";

export type CommandResultError = {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly details?: unknown;
};

export type CommandReviewItem = {
  readonly id: string;
  readonly title: string;
  readonly status: "candidate" | "proposal" | "approved" | "rejected";
  readonly evidence?: readonly string[];
};

export type CommandCandidateFinding = {
  readonly id: string;
  readonly kind: "repo-skill" | "legacy" | "deprecation" | "documentation" | "other";
  readonly title: string;
  readonly summary: string;
  readonly evidence?: readonly string[];
};

export type CommandResult<TData = unknown> = {
  readonly ok: boolean;
  readonly status: CommandResultStatus;
  readonly command: string;
  readonly summary: string;
  readonly data?: TData;
  readonly warnings: readonly string[];
  readonly errors: readonly CommandResultError[];
  readonly next_steps: readonly string[];
  readonly duration_ms?: number;
  readonly repository?: {
    readonly root?: string;
    readonly name?: string;
  };
  readonly contract?: {
    readonly path?: string;
    readonly valid?: boolean;
  };
  readonly session_id: string;
  readonly agent_run_id?: string;
  readonly tool_call_id?: string;
  readonly approval_required?: boolean;
  readonly proposal_id?: string;
  readonly review_items: readonly CommandReviewItem[];
  readonly candidate_findings: readonly CommandCandidateFinding[];
};

export type BuildCommandResultInput<TData = unknown> = {
  readonly ok: boolean;
  readonly status?: CommandResultStatus;
  readonly command: string;
  readonly summary: string;
  readonly data?: TData;
  readonly warnings?: readonly string[];
  readonly errors?: readonly CommandResultError[];
  readonly next_steps?: readonly string[];
  readonly duration_ms?: number;
  readonly repository?: CommandResult["repository"];
  readonly contract?: CommandResult["contract"];
  readonly session_id?: string;
  readonly agent_run_id?: string;
  readonly tool_call_id?: string;
  readonly approval_required?: boolean;
  readonly proposal_id?: string;
  readonly review_items?: readonly CommandReviewItem[];
  readonly candidate_findings?: readonly CommandCandidateFinding[];
};

export function buildCommandResult<TData = unknown>(
  input: BuildCommandResultInput<TData>
): CommandResult<TData> {
  return {
    ok: input.ok,
    status: input.status ?? (input.ok ? "success" : "failure"),
    command: input.command,
    summary: input.summary,
    data: input.data,
    warnings: input.warnings ?? [],
    errors: input.errors ?? [],
    next_steps: input.next_steps ?? [],
    duration_ms: input.duration_ms,
    repository: input.repository,
    contract: input.contract,
    session_id: input.session_id ?? "unknown",
    agent_run_id: input.agent_run_id,
    tool_call_id: input.tool_call_id,
    approval_required: input.approval_required,
    proposal_id: input.proposal_id,
    review_items: input.review_items ?? [],
    candidate_findings: input.candidate_findings ?? []
  };
}

export function buildSuccessResult<TData>(
  context: CommandContext,
  input: Omit<BuildCommandResultInput<TData>, "ok" | "session_id" | "agent_run_id" | "tool_call_id">
): CommandResult<TData> {
  return buildCommandResult({
    ...input,
    ok: true,
    session_id: context.sessionId,
    agent_run_id: context.agent.agentRunId,
    tool_call_id: context.agent.toolCallId
  });
}

export function buildFailureResult(
  context: CommandContext,
  input: Omit<BuildCommandResultInput, "ok" | "session_id" | "agent_run_id" | "tool_call_id">
): CommandResult {
  return buildCommandResult({
    ...input,
    ok: false,
    session_id: context.sessionId,
    agent_run_id: context.agent.agentRunId,
    tool_call_id: context.agent.toolCallId
  });
}

export function serializeCommandResult(result: CommandResult): string {
  return JSON.stringify(result, null, 2);
}

export function summarizeCommandResult(result: CommandResult): string {
  const lines = [result.summary];

  if (result.warnings.length > 0) {
    lines.push(...result.warnings.map((warning) => `Warning: ${warning}`));
  }

  if (result.errors.length > 0) {
    lines.push(...result.errors.map((error) => `Error: ${error.message}`));
  }

  if (result.next_steps.length > 0) {
    lines.push(...result.next_steps.map((nextStep) => `Next: ${nextStep}`));
  }

  return lines.join("\n");
}
