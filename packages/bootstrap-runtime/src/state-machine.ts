import type { BootstrapSession, RuntimeStatus, RuntimeStep } from "./types.js";

export type RuntimeTransition =
  | {
      readonly ok: true;
      readonly from: RuntimeStatus;
      readonly to: RuntimeStatus;
    }
  | {
      readonly ok: false;
      readonly from: RuntimeStatus;
      readonly to: RuntimeStatus;
      readonly reason: string;
    };

const allowedTransitions: Readonly<Record<RuntimeStatus, readonly RuntimeStatus[]>> = {
  pending: [
    "running",
    "succeeded",
    "failed",
    "interrupted",
    "skipped",
    "timed_out",
    "stopped",
    "unknown"
  ],
  running: ["succeeded", "failed", "interrupted", "timed_out", "stopped", "unknown"],
  succeeded: ["unknown"],
  failed: ["unknown"],
  interrupted: ["stopped", "unknown"],
  skipped: ["unknown"],
  timed_out: ["stopped", "unknown"],
  stopped: ["unknown"],
  unknown: [
    "pending",
    "running",
    "succeeded",
    "failed",
    "interrupted",
    "skipped",
    "timed_out",
    "stopped"
  ]
};

export function canTransitionRuntimeStatus(from: RuntimeStatus, to: RuntimeStatus): boolean {
  return from === to || allowedTransitions[from].includes(to);
}

export function transitionRuntimeStatus(from: RuntimeStatus, to: RuntimeStatus): RuntimeTransition {
  if (canTransitionRuntimeStatus(from, to)) {
    return {
      ok: true,
      from,
      to
    };
  }

  return {
    ok: false,
    from,
    to,
    reason: `Invalid runtime status transition from ${from} to ${to}.`
  };
}

export function updateRuntimeStepStatus(
  step: RuntimeStep,
  status: RuntimeStatus,
  timestamp?: string
): RuntimeStep {
  const transition = transitionRuntimeStatus(step.status, status);

  if (!transition.ok) {
    throw new Error(transition.reason);
  }

  return {
    ...step,
    status,
    ...(status === "running" && step.startedAt === undefined ? { startedAt: timestamp } : {}),
    ...(isTerminalStatus(status) ? { completedAt: timestamp } : {})
  };
}

export function summarizeSessionStatus(session: BootstrapSession): RuntimeStatus {
  if (session.status !== "running" && session.status !== "pending") {
    return session.status;
  }

  const statuses = session.steps.map((step) => step.status);

  if (statuses.some((status) => status === "failed")) {
    return "failed";
  }

  if (statuses.some((status) => status === "interrupted")) {
    return "interrupted";
  }

  if (statuses.some((status) => status === "timed_out")) {
    return "timed_out";
  }

  if (statuses.some((status) => status === "running")) {
    return "running";
  }

  if (statuses.length > 0 && statuses.every((status) => isTerminalStatus(status))) {
    return "succeeded";
  }

  return session.status;
}

export function isTerminalStatus(status: RuntimeStatus): boolean {
  return ["succeeded", "failed", "interrupted", "skipped", "timed_out", "stopped"].includes(status);
}
