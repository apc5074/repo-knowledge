import {
  createJsonVerificationHistoryStore,
  resolveVerificationHistoryStorePaths,
  VerificationHistoryStoreError,
  type VerificationCheckResult,
  type VerificationHistory,
  type VerificationHistoryStore,
  type VerificationRun
} from "@repo-knowledge/verification-runtime";

export type VerificationObservationKind =
  | "failed_check"
  | "repeated_failure"
  | "blocked_check"
  | "skipped_check"
  | "missing_configured_command";

export type VerificationObservation = {
  readonly kind: VerificationObservationKind;
  readonly severity: "info" | "warning" | "error";
  readonly checkId: string;
  readonly runIds: readonly string[];
  readonly command?: string;
  readonly status?: VerificationCheckResult["status"];
  readonly count: number;
  readonly summary: string;
};

export type VerificationHistoryInspection = {
  readonly latestRun?: VerificationRun;
  readonly history: VerificationHistory;
  readonly recentRuns: readonly VerificationRun[];
  readonly observations: readonly VerificationObservation[];
  readonly warnings: readonly string[];
};

export type InspectVerificationHistoryInput = {
  readonly repositoryStateRoot?: string;
  readonly historyStore?: VerificationHistoryStore;
  readonly maxRuns?: number;
};

const defaultMaxRuns = 10;

export async function inspectVerificationHistory(
  input: InspectVerificationHistoryInput
): Promise<VerificationHistoryInspection> {
  const store =
    input.historyStore ??
    (input.repositoryStateRoot === undefined
      ? undefined
      : createJsonVerificationHistoryStore(
          resolveVerificationHistoryStorePaths({ repositoryStateRoot: input.repositoryStateRoot })
        ));

  if (store === undefined) {
    return emptyInspection(["Verification history state is unavailable."]);
  }

  try {
    const history = await store.readHistory();
    const latestRun = await store.readLatestRun();
    const runIds = history.runs.slice(0, input.maxRuns ?? defaultMaxRuns).map((run) => run.runId);
    const recentRuns = (await Promise.all(runIds.map((runId) => store.readRun(runId)))).filter(
      (run): run is VerificationRun => run !== undefined
    );

    return {
      latestRun,
      history,
      recentRuns,
      observations: observationsForRuns(recentRuns),
      warnings: history.runs.length === 0 ? ["No Board verification runs have been recorded."] : []
    };
  } catch (error) {
    return emptyInspection([verificationStateWarning(error)]);
  }
}

function observationsForRuns(runs: readonly VerificationRun[]): readonly VerificationObservation[] {
  const observations: VerificationObservation[] = [];
  const grouped = new Map<string, VerificationCheckResult[]>();

  for (const run of runs) {
    for (const result of run.results) {
      if (result.status === "passed" || result.status === "pending") {
        continue;
      }

      const key = resultKey(result);
      grouped.set(key, [...(grouped.get(key) ?? []), result]);

      if (result.status === "failed" || result.status === "timed_out") {
        observations.push({
          kind: "failed_check",
          severity: "error",
          checkId: result.id,
          runIds: [run.runId],
          command: commandLabel(result),
          status: result.status,
          count: 1,
          summary: `Verification check ${result.id} ${result.status} in run ${run.runId}.`
        });
      }

      if (result.status === "blocked") {
        observations.push({
          kind: "blocked_check",
          severity: "warning",
          checkId: result.id,
          runIds: [run.runId],
          command: commandLabel(result),
          status: result.status,
          count: 1,
          summary: `Verification check ${result.id} was blocked in run ${run.runId}.`
        });
      }

      if (result.status === "skipped") {
        observations.push({
          kind: "skipped_check",
          severity: "info",
          checkId: result.id,
          runIds: [run.runId],
          command: commandLabel(result),
          status: result.status,
          count: 1,
          summary: `Verification check ${result.id} was skipped in run ${run.runId}.`
        });
      }

      if (result.status === "not_configured") {
        observations.push({
          kind: "missing_configured_command",
          severity: "warning",
          checkId: result.id,
          runIds: [run.runId],
          command: commandLabel(result),
          status: result.status,
          count: 1,
          summary: `Verification check ${result.id} is not configured in run ${run.runId}.`
        });
      }
    }
  }

  for (const [key, results] of grouped.entries()) {
    if (results.length < 2) {
      continue;
    }

    const [checkId, command] = key.split("\0");
    observations.push({
      kind: "repeated_failure",
      severity: "warning",
      checkId: checkId ?? key,
      runIds: runs
        .filter((run) => run.results.some((result) => resultKey(result) === key))
        .map((run) => run.runId),
      command: command === "" ? undefined : command,
      status: results[0]?.status,
      count: results.length,
      summary: `Verification check ${checkId} recurred ${results.length} times.`
    });
  }

  return observations;
}

function resultKey(result: VerificationCheckResult): string {
  return `${result.id}\0${commandLabel(result) ?? ""}\0${result.status}`;
}

function commandLabel(result: VerificationCheckResult): string | undefined {
  if (result.command === undefined) {
    return undefined;
  }

  return [result.command.command, ...result.command.args].join(" ");
}

function emptyInspection(warnings: readonly string[]): VerificationHistoryInspection {
  return {
    history: {
      schemaVersion: 1,
      runs: []
    },
    recentRuns: [],
    observations: [],
    warnings
  };
}

function verificationStateWarning(error: unknown): string {
  if (error instanceof VerificationHistoryStoreError) {
    return `Verification history could not be read: ${error.message}`;
  }

  return `Verification history could not be read: ${error instanceof Error ? error.message : String(error)}`;
}
