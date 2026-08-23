import { runVerificationOrchestrator } from "./orchestrator.js";
import { serializeVerificationRunToJson } from "./json-output.js";
import type { VerificationPlan, VerificationRun } from "./types.js";

export type RunVerificationToolInput = {
  readonly repositoryRoot: string;
  readonly contractPath?: string;
  readonly repositoryStateRoot?: string;
  readonly dryRun?: boolean;
  readonly all?: boolean;
  readonly changed?: boolean;
  readonly baseRef?: string;
  readonly sinceRef?: string;
  readonly changedPaths?: readonly string[];
  readonly requestedPaths?: readonly string[];
  readonly requestedComponentIds?: readonly string[];
  readonly requestedCheckIds?: readonly string[];
  readonly skippedCheckIds?: readonly string[];
  readonly noDefault?: boolean;
  readonly timeoutSeconds?: number;
  readonly env?: Readonly<Record<string, string | undefined>>;
};

export type RunVerificationToolResult = {
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly exitCode: number;
  readonly runId?: string;
  readonly plan?: VerificationPlan;
  readonly run?: VerificationRun;
  readonly json?: ReturnType<typeof serializeVerificationRunToJson>;
  readonly error?: string;
};

export async function runVerificationTool(
  input: RunVerificationToolInput
): Promise<RunVerificationToolResult> {
  const result = await runVerificationOrchestrator(input);

  if (!result.ok) {
    return {
      ok: false,
      dryRun: input.dryRun ?? false,
      exitCode: result.exitCode,
      plan: result.plan,
      run: result.run,
      error: result.error
    };
  }

  return {
    ok: true,
    dryRun: result.dryRun,
    exitCode: result.exitCode,
    runId: result.run.runId,
    plan: result.plan,
    run: result.run,
    json: serializeVerificationRunToJson(result.run)
  };
}
