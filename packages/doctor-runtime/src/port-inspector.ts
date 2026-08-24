import type { DoctorRepositoryContext } from "./contract-loader.js";
import type { RuntimeSessionInspection } from "./runtime-inspector.js";

export type ExpectedPort = {
  readonly id: string;
  readonly port: number;
  readonly host: string;
  readonly ownerId: string;
  readonly ownerType: "application" | "service";
};

export type PortStatus = "available" | "occupied" | "listening" | "closed" | "unknown";

export type PortOwnerKind = "board-managed" | "unknown";

export type PortCheckResult = ExpectedPort & {
  readonly status: PortStatus;
  readonly ownerKind: PortOwnerKind;
  readonly processSummary?: string;
};

export type PortObservationKind = "occupied_expected_port" | "missing_expected_listener";

export type PortObservation = {
  readonly kind: PortObservationKind;
  readonly severity: "warning" | "error";
  readonly port: number;
  readonly host: string;
  readonly ownerId: string;
  readonly ownerKind: PortOwnerKind;
  readonly summary: string;
};

export type PortInspection = {
  readonly expectedPorts: readonly ExpectedPort[];
  readonly checks: readonly PortCheckResult[];
  readonly observations: readonly PortObservation[];
  readonly warnings: readonly string[];
};

export type PortChecker = (port: ExpectedPort) => Promise<{
  readonly status: PortStatus;
  readonly processSummary?: string;
}>;

export type InspectPortsInput = {
  readonly context: DoctorRepositoryContext;
  readonly runtimeInspection?: RuntimeSessionInspection;
  readonly host?: string;
  readonly checkPort?: PortChecker;
  readonly requireListening?: boolean;
};

const defaultHost = "127.0.0.1";

export async function inspectPorts(input: InspectPortsInput): Promise<PortInspection> {
  const expectedPorts = collectExpectedPorts(input.context, input.host ?? defaultHost);
  const checkPort = input.checkPort ?? defaultPortChecker;

  if (expectedPorts.length === 0) {
    return {
      expectedPorts,
      checks: [],
      observations: [],
      warnings: ["No expected application or service ports are defined in the contract."]
    };
  }

  const boardManagedPorts = collectBoardManagedPorts(input.runtimeInspection);
  const checks = await Promise.all(
    expectedPorts.map(async (port) => {
      const check = await checkPort(port);

      return {
        ...port,
        ...check,
        ownerKind: boardManagedPorts.has(portKey(port)) ? "board-managed" : "unknown"
      } satisfies PortCheckResult;
    })
  );
  const requireListening =
    input.requireListening ??
    input.runtimeInspection?.observations.some((observation) => observation.severity === "error") ??
    false;

  return {
    expectedPorts,
    checks,
    observations: checks.flatMap((check) => observationsForPort(check, requireListening)),
    warnings: []
  };
}

export function collectExpectedPorts(
  context: DoctorRepositoryContext,
  host = defaultHost
): readonly ExpectedPort[] {
  const contract = context.contract;

  if (contract === undefined) {
    return [];
  }

  return [
    ...Object.values(contract.applications ?? {}).flatMap((application) =>
      (application.ports ?? []).map((port) => ({
        id: `application-port-${application.id}-${port}`,
        port,
        host,
        ownerId: application.id,
        ownerType: "application" as const
      }))
    ),
    ...Object.values(contract.services ?? {}).flatMap((service) =>
      (service.ports ?? []).map((port) => ({
        id: `service-port-${service.id}-${port}`,
        port,
        host,
        ownerId: service.id,
        ownerType: "service" as const
      }))
    )
  ].sort((left, right) => left.port - right.port || left.id.localeCompare(right.id));
}

function observationsForPort(
  check: PortCheckResult,
  requireListening: boolean
): readonly PortObservation[] {
  if (check.status === "occupied") {
    return [
      {
        kind: "occupied_expected_port",
        severity: check.ownerKind === "board-managed" ? "warning" : "error",
        port: check.port,
        host: check.host,
        ownerId: check.ownerId,
        ownerKind: check.ownerKind,
        summary:
          check.ownerKind === "board-managed"
            ? `${check.ownerId} port ${check.port} is occupied by a Board-managed process.`
            : `${check.ownerId} port ${check.port} is occupied by an unknown process.`
      }
    ];
  }

  if (requireListening && (check.status === "closed" || check.status === "available")) {
    return [
      {
        kind: "missing_expected_listener",
        severity: "error",
        port: check.port,
        host: check.host,
        ownerId: check.ownerId,
        ownerKind: check.ownerKind,
        summary: `${check.ownerId} port ${check.port} is not listening.`
      }
    ];
  }

  return [];
}

function collectBoardManagedPorts(
  runtimeInspection: RuntimeSessionInspection | undefined
): ReadonlySet<string> {
  const ports = new Set<string>();

  for (const session of runtimeInspection?.recentSessions ?? []) {
    for (const resource of session.resources) {
      const port = resource.metadata?.port;
      const host =
        typeof resource.metadata?.host === "string" ? resource.metadata.host : defaultHost;

      if (resource.kind === "port" && typeof port === "number") {
        ports.add(`${host}:${port}`);
      }
    }
  }

  return ports;
}

function portKey(port: ExpectedPort): string {
  return `${port.host}:${port.port}`;
}

async function defaultPortChecker(): Promise<{
  readonly status: PortStatus;
}> {
  return {
    status: "unknown"
  };
}
