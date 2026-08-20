import { createConnection, createServer } from "node:net";

import type {
  BootstrapPlan,
  RuntimePortCheckMode,
  RuntimePortCheckResult,
  RuntimePortStatus
} from "./types.js";

export type ExpectedRuntimePort = {
  readonly id: string;
  readonly port: number;
  readonly host: string;
  readonly ownerId: string;
};

export type RuntimePortCheckInput = {
  readonly plan: BootstrapPlan;
  readonly mode: RuntimePortCheckMode;
  readonly host?: string;
  readonly timeoutMs?: number;
  readonly checkPort?: (
    port: ExpectedRuntimePort,
    mode: RuntimePortCheckMode
  ) => Promise<RuntimePortStatus>;
};

const defaultHost = "127.0.0.1";
const defaultTimeoutMs = 500;

export async function checkRuntimePorts(
  input: RuntimePortCheckInput
): Promise<readonly RuntimePortCheckResult[]> {
  const ports = collectExpectedRuntimePorts(input.plan, input.host ?? defaultHost);

  return Promise.all(
    ports.map(async (port) => {
      const status =
        input.checkPort === undefined
          ? await checkPort(port, input.mode, input.timeoutMs ?? defaultTimeoutMs)
          : await input.checkPort(port, input.mode);

      return {
        ...port,
        mode: input.mode,
        status,
        summary: summarizePort(port, input.mode, status)
      };
    })
  );
}

async function checkPort(
  port: ExpectedRuntimePort,
  mode: RuntimePortCheckMode,
  timeoutMs: number
): Promise<RuntimePortStatus> {
  return mode === "availability"
    ? checkPortAvailability(port.host, port.port)
    : checkPortListening(port.host, port.port, timeoutMs);
}

export function collectExpectedRuntimePorts(
  plan: BootstrapPlan,
  host = defaultHost
): readonly ExpectedRuntimePort[] {
  return plan.resources
    .filter((resource) => resource.kind === "port")
    .flatMap((resource) => {
      const port = resource.metadata?.port;
      const ownerId =
        stringMetadata(resource.metadata?.applicationId) ??
        stringMetadata(resource.metadata?.serviceId) ??
        resource.id;

      if (typeof port !== "number") {
        return [];
      }

      return [
        {
          id: resource.id,
          port,
          host,
          ownerId
        }
      ];
    })
    .sort((left, right) => left.port - right.port || left.id.localeCompare(right.id));
}

async function checkPortAvailability(host: string, port: number): Promise<RuntimePortStatus> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", (error: NodeJS.ErrnoException) => {
      resolve(error.code === "EADDRINUSE" ? "occupied" : "unknown");
    });
    server.listen(port, host, () => {
      server.close(() => {
        resolve("available");
      });
    });
  });
}

async function checkPortListening(
  host: string,
  port: number,
  timeoutMs: number
): Promise<RuntimePortStatus> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve("closed");
    }, timeoutMs);

    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve("listening");
    });
    socket.once("error", () => {
      clearTimeout(timeout);
      resolve("closed");
    });
  });
}

function summarizePort(
  port: ExpectedRuntimePort,
  mode: RuntimePortCheckMode,
  status: RuntimePortStatus
): string {
  if (mode === "availability") {
    return status === "available"
      ? `${port.ownerId} port ${port.port} is available before startup.`
      : `${port.ownerId} port ${port.port} is ${status} before startup.`;
  }

  return status === "listening"
    ? `${port.ownerId} port ${port.port} is listening.`
    : `${port.ownerId} port ${port.port} is ${status} after startup.`;
}

function stringMetadata(value: string | number | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
