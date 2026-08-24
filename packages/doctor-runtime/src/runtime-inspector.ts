import {
  createJsonRuntimeStateStore,
  resolveRuntimeStateStorePaths,
  RuntimeStateStoreError,
  type BootstrapSession,
  type ManagedProcessRecord,
  type RuntimeStateStore
} from "@repo-knowledge/bootstrap-runtime";

export type RuntimeSessionObservationKind =
  | "failed_step"
  | "failed_resource"
  | "failed_health_check"
  | "failed_process"
  | "failed_migration"
  | "failed_seed"
  | "stale_session";

export type RuntimeSessionObservation = {
  readonly kind: RuntimeSessionObservationKind;
  readonly sessionId: string;
  readonly severity: "warning" | "error";
  readonly summary: string;
  readonly stepId?: string;
  readonly resourceId?: string;
  readonly healthCheckId?: string;
  readonly commandResultId?: string;
};

export type RuntimeSessionInspection = {
  readonly latestSession?: BootstrapSession;
  readonly recentSessions: readonly BootstrapSession[];
  readonly managedProcesses: readonly ManagedProcessRecord[];
  readonly observations: readonly RuntimeSessionObservation[];
  readonly staleSessionIds: readonly string[];
  readonly warnings: readonly string[];
};

export type InspectRuntimeSessionsInput = {
  readonly repositoryStateRoot?: string;
  readonly stateStore?: RuntimeStateStore;
  readonly now?: Date;
  readonly staleAfterMs?: number;
  readonly maxSessions?: number;
};

const defaultStaleAfterMs = 60 * 60 * 1000;
const defaultMaxSessions = 10;

export async function inspectRuntimeSessions(
  input: InspectRuntimeSessionsInput
): Promise<RuntimeSessionInspection> {
  const store =
    input.stateStore ??
    (input.repositoryStateRoot === undefined
      ? undefined
      : createJsonRuntimeStateStore(
          resolveRuntimeStateStorePaths({ repositoryStateRoot: input.repositoryStateRoot })
        ));

  if (store === undefined) {
    return emptyInspection(["Runtime session state is unavailable."]);
  }

  try {
    const sessions = [...(await store.listSessions())]
      .sort((left, right) => sessionSortTimestamp(right).localeCompare(sessionSortTimestamp(left)))
      .slice(0, input.maxSessions ?? defaultMaxSessions);
    const latestSession = await store.readLatestSession();
    const managedProcesses = await store.readProcesses();
    const staleSessionIds = sessions
      .filter((session) =>
        isStaleSession(session, input.now ?? new Date(), input.staleAfterMs ?? defaultStaleAfterMs)
      )
      .map((session) => session.id);

    return {
      latestSession,
      recentSessions: sessions,
      managedProcesses,
      observations: sessions.flatMap((session) =>
        observationsForSession(session, staleSessionIds.includes(session.id))
      ),
      staleSessionIds,
      warnings: sessions.length === 0 ? ["No Board runtime sessions have been recorded."] : []
    };
  } catch (error) {
    return emptyInspection([runtimeStateWarning(error)]);
  }
}

function observationsForSession(
  session: BootstrapSession,
  stale: boolean
): readonly RuntimeSessionObservation[] {
  return [
    ...session.steps
      .filter((step) => step.status === "failed" || step.status === "timed_out")
      .map(
        (step) =>
          ({
            kind:
              step.kind === "setup" && /migrat/i.test(step.id)
                ? "failed_migration"
                : step.kind === "setup" && /seed/i.test(step.id)
                  ? "failed_seed"
                  : "failed_step",
            sessionId: session.id,
            severity: "error",
            stepId: step.id,
            summary: `Runtime step ${step.id} is ${step.status}.`
          }) satisfies RuntimeSessionObservation
      ),
    ...session.resources
      .filter((resource) => resource.status === "failed" || resource.status === "timed_out")
      .map(
        (resource) =>
          ({
            kind: "failed_resource",
            sessionId: session.id,
            severity: "error",
            resourceId: resource.id,
            summary: `Runtime resource ${resource.id} is ${resource.status}.`
          }) satisfies RuntimeSessionObservation
      ),
    ...session.healthCheckResults
      .filter(
        (healthCheck) => healthCheck.status === "failed" || healthCheck.status === "timed_out"
      )
      .map(
        (healthCheck) =>
          ({
            kind: "failed_health_check",
            sessionId: session.id,
            severity: "error",
            healthCheckId: healthCheck.id,
            summary: `Runtime health check ${healthCheck.id} is ${healthCheck.status}.`
          }) satisfies RuntimeSessionObservation
      ),
    ...session.commandResults
      .filter((result) => result.status === "failed" || result.status === "timed_out")
      .map(
        (result) =>
          ({
            kind:
              /migrat/i.test(result.id) || /migrat/i.test(result.command)
                ? "failed_migration"
                : /seed/i.test(result.id) || /seed/i.test(result.command)
                  ? "failed_seed"
                  : "failed_process",
            sessionId: session.id,
            severity: "error",
            commandResultId: result.id,
            summary: `Runtime command ${result.id} is ${result.status}.`
          }) satisfies RuntimeSessionObservation
      ),
    ...(stale
      ? [
          {
            kind: "stale_session",
            sessionId: session.id,
            severity: "warning",
            summary: `Runtime session ${session.id} appears stale.`
          } satisfies RuntimeSessionObservation
        ]
      : [])
  ];
}

function isStaleSession(session: BootstrapSession, now: Date, staleAfterMs: number): boolean {
  if (session.status !== "running" || session.startedAt === undefined) {
    return false;
  }

  const startedAt = Date.parse(session.startedAt);

  return Number.isFinite(startedAt) && now.getTime() - startedAt > staleAfterMs;
}

function sessionSortTimestamp(session: BootstrapSession): string {
  return session.startedAt ?? session.completedAt ?? session.id;
}

function emptyInspection(warnings: readonly string[]): RuntimeSessionInspection {
  return {
    recentSessions: [],
    managedProcesses: [],
    observations: [],
    staleSessionIds: [],
    warnings
  };
}

function runtimeStateWarning(error: unknown): string {
  if (error instanceof RuntimeStateStoreError) {
    return `Runtime state could not be read: ${error.message}`;
  }

  return `Runtime state could not be read: ${error instanceof Error ? error.message : String(error)}`;
}
