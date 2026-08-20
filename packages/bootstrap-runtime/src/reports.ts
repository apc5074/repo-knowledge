import type {
  BootstrapSession,
  RuntimeFormattedReport,
  RuntimeHealthCheckResult,
  RuntimeReportCounts,
  RuntimeReportDetails,
  RuntimeResource,
  RuntimeStatus,
  StartRuntimeResult,
  StopRuntimeResult,
  RuntimeStatusResult
} from "./types.js";

const countStatuses: readonly RuntimeStatus[] = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "interrupted",
  "skipped",
  "timed_out",
  "stopped",
  "unknown"
];

export function formatStartRuntimeReport(result: StartRuntimeResult): RuntimeFormattedReport {
  return formatRuntimeReport({
    status: result.status,
    session: result.session,
    resources: result.session?.resources ?? result.plan.resources,
    healthCheckResults: result.session?.healthCheckResults ?? [],
    nextSteps: result.nextSteps,
    fallbackSummary: result.summary
  });
}

export function formatRuntimeStatusReport(result: RuntimeStatusResult): RuntimeFormattedReport {
  return formatRuntimeReport({
    status: result.status,
    session: result.session,
    resources: result.resources,
    healthCheckResults: result.session?.healthCheckResults ?? [],
    nextSteps: result.nextSteps,
    fallbackSummary: result.summary
  });
}

export function formatStopRuntimeReport(result: StopRuntimeResult): RuntimeFormattedReport {
  const details = buildReportDetails({
    status: result.status,
    session: undefined,
    resources: result.stoppedResources,
    healthCheckResults: [],
    nextSteps: result.nextSteps
  });
  const stoppedSummary =
    result.stoppedSessionIds.length === 0
      ? result.summary
      : `Stopped ${result.stoppedSessionIds.length} runtime session(s).`;
  const summary =
    result.stoppedSessionIds.length === 0
      ? stoppedSummary
      : `${stoppedSummary} ${summarizeResourceCounts(details.resources)}.`;

  return {
    summary,
    human: buildHumanReport(summary, details),
    details
  };
}

function formatRuntimeReport(input: {
  readonly status: RuntimeStatus;
  readonly session?: BootstrapSession;
  readonly resources: readonly RuntimeResource[];
  readonly healthCheckResults: readonly RuntimeHealthCheckResult[];
  readonly nextSteps: readonly string[];
  readonly fallbackSummary: string;
}): RuntimeFormattedReport {
  const details = buildReportDetails(input);
  const sessionPart =
    details.sessionId === undefined
      ? input.fallbackSummary
      : `Runtime session ${details.sessionId}`;
  const summary =
    details.sessionId === undefined
      ? input.fallbackSummary
      : `${sessionPart} is ${details.status}. ${summarizeStepCounts(
          details.steps
        )}; ${summarizeResourceCounts(details.resources)}.`;

  return {
    summary,
    human: buildHumanReport(summary, details),
    details
  };
}

function buildReportDetails(input: {
  readonly status: RuntimeStatus;
  readonly session?: BootstrapSession;
  readonly resources: readonly RuntimeResource[];
  readonly healthCheckResults: readonly RuntimeHealthCheckResult[];
  readonly nextSteps: readonly string[];
}): RuntimeReportDetails {
  const steps = input.session?.steps ?? [];
  const resources = input.resources;

  return {
    sessionId: input.session?.id,
    status: input.status,
    steps: countRuntimeStatuses(steps),
    resources: countRuntimeStatuses(resources),
    healthChecks: countRuntimeStatuses(input.healthCheckResults),
    services: resources
      .filter((resource) => resource.kind === "compose-service")
      .map((resource) => resource.label ?? resource.id)
      .sort(),
    applications: resources
      .filter((resource) => resource.kind === "process")
      .map((resource) => resource.label ?? resource.id)
      .sort(),
    ports: resources
      .filter((resource) => resource.kind === "port")
      .map((resource) => ({
        ownerId: stringMetadata(resource.metadata?.ownerId),
        host: stringMetadata(resource.metadata?.host),
        port: numberMetadata(resource.metadata?.port),
        status: resource.status
      }))
      .sort((left, right) =>
        `${left.ownerId}:${left.port}`.localeCompare(`${right.ownerId}:${right.port}`)
      ),
    failedStepIds: steps
      .filter((step) => ["failed", "interrupted", "timed_out"].includes(step.status))
      .map((step) => step.id),
    failedResourceIds: resources
      .filter((resource) => ["failed", "interrupted", "timed_out"].includes(resource.status))
      .map((resource) => resource.id),
    durations: {
      sessionMs: sessionDurationMs(input.session),
      commandMs: sumDurations(input.session?.commandResults ?? []),
      healthCheckMs: sumDurations(input.healthCheckResults)
    },
    nextSteps: input.nextSteps
  };
}

function countRuntimeStatuses(
  items: readonly { readonly status: RuntimeStatus }[]
): RuntimeReportCounts {
  const counts = Object.fromEntries(countStatuses.map((status) => [status, 0])) as Record<
    RuntimeStatus,
    number
  >;

  for (const item of items) {
    counts[item.status] += 1;
  }

  return {
    total: items.length,
    pending: counts.pending,
    running: counts.running,
    succeeded: counts.succeeded,
    failed: counts.failed,
    interrupted: counts.interrupted,
    skipped: counts.skipped,
    timedOut: counts.timed_out,
    stopped: counts.stopped,
    unknown: counts.unknown
  };
}

function buildHumanReport(summary: string, details: RuntimeReportDetails): string {
  const lines = [summary];

  if (details.services.length > 0) {
    lines.push(`Services: ${details.services.join(", ")}`);
  }

  if (details.applications.length > 0) {
    lines.push(`Apps/workers: ${details.applications.join(", ")}`);
  }

  if (details.ports.length > 0) {
    lines.push(
      `Ports: ${details.ports
        .map((port) => `${port.ownerId ?? "unknown"}:${port.port ?? "unknown"} ${port.status}`)
        .join(", ")}`
    );
  }

  if (details.failedStepIds.length > 0) {
    lines.push(`Failed steps: ${details.failedStepIds.join(", ")}`);
  }

  lines.push(
    `Durations: commands ${details.durations.commandMs}ms, health ${details.durations.healthCheckMs}ms${
      details.durations.sessionMs === undefined ? "" : `, session ${details.durations.sessionMs}ms`
    }`
  );

  return lines.join("\n");
}

function summarizeStepCounts(counts: RuntimeReportCounts): string {
  return `${counts.succeeded} step(s) succeeded, ${counts.failed} failed, ${counts.interrupted} interrupted, ${counts.skipped} skipped`;
}

function summarizeResourceCounts(counts: RuntimeReportCounts): string {
  return `${counts.running} resource(s) running, ${counts.stopped} stopped, ${counts.failed} failed`;
}

function stringMetadata(value: string | number | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberMetadata(value: string | number | boolean | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function sumDurations(
  items: readonly { readonly durationMs?: number; readonly elapsedMs?: number }[]
): number {
  return items.reduce((total, item) => total + (item.durationMs ?? item.elapsedMs ?? 0), 0);
}

function sessionDurationMs(session: BootstrapSession | undefined): number | undefined {
  if (session?.startedAt === undefined || session.completedAt === undefined) {
    return undefined;
  }

  const startedAt = Date.parse(session.startedAt);
  const completedAt = Date.parse(session.completedAt);

  return Number.isFinite(startedAt) && Number.isFinite(completedAt)
    ? Math.max(0, completedAt - startedAt)
    : undefined;
}
