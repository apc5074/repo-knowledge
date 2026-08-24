import { serializeDoctorToJson, type DoctorJsonOutput } from "./json-output.js";
import { runDoctor, type RunDoctorInput } from "./doctor-runner.js";
import type { DiagnosticCategory, KnownProblemRecord, VerifiedResolutionRecord } from "./types.js";

export type RunDoctorAgentToolInput = {
  readonly repositoryRoot: string;
  readonly contractPath?: string;
  readonly repositoryStateRoot?: string;
  readonly categories?: readonly DiagnosticCategory[];
  readonly includeLogs?: boolean;
  readonly disabledInspectors?: RunDoctorInput["disabledInspectors"];
  readonly dryRun?: boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly runId?: string;
};

export type DoctorAgentToolRunRecord = DoctorJsonOutput & {
  readonly tool_name: "doctor";
  readonly ok: boolean;
  readonly known_problems: readonly KnownProblemRecord[];
  readonly resolutions: readonly VerifiedResolutionRecord[];
  readonly next_steps: readonly string[];
};

export async function runDoctorAgentTool(
  input: RunDoctorAgentToolInput
): Promise<DoctorAgentToolRunRecord> {
  const result = await runDoctor({
    repositoryRoot: input.repositoryRoot,
    contractPath: input.contractPath,
    repositoryStateRoot: input.repositoryStateRoot,
    categories: input.categories,
    includeLogs: input.includeLogs,
    disabledInspectors: input.disabledInspectors,
    dryRun: input.dryRun,
    env: input.env,
    runId: input.runId
  });
  const output = serializeDoctorToJson({
    report: result.report,
    statePaths: result.statePaths,
    enabledInspectors: result.enabledInspectors,
    skippedInspectors: result.skippedInspectors
  });

  return {
    ...output,
    tool_name: "doctor",
    ok: result.report.ok,
    known_problems: result.report.knownProblems,
    resolutions: result.report.resolutions,
    next_steps: result.report.nextSteps
  };
}
