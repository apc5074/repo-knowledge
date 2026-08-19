import { interruptedError } from "./errors/board-error.js";

export type InterruptSignalName = "SIGINT" | "SIGTERM";

export type InterruptController = {
  readonly signal: AbortSignal;
  readonly interrupt: (reason?: string) => void;
  readonly throwIfInterrupted: () => void;
};

export type ProcessSignalTarget = {
  readonly once: (signal: InterruptSignalName, listener: () => void) => unknown;
  readonly off: (signal: InterruptSignalName, listener: () => void) => unknown;
};

export type InstalledInterruptHandlers = {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
};

export function createInterruptController(): InterruptController {
  const controller = new AbortController();

  return {
    signal: controller.signal,
    interrupt: (reason = "Command interrupted.") => {
      if (!controller.signal.aborted) {
        controller.abort(reason);
      }
    },
    throwIfInterrupted: () => {
      throwIfInterrupted(controller.signal);
    }
  };
}

export function throwIfInterrupted(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw interruptedError(formatInterruptedReason(signal.reason));
  }
}

export function interruptedPromise(signal?: AbortSignal): Promise<never> | undefined {
  if (signal === undefined) {
    return undefined;
  }

  if (signal.aborted) {
    return Promise.reject(interruptedError(formatInterruptedReason(signal.reason)));
  }

  return new Promise((_, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        reject(interruptedError(formatInterruptedReason(signal.reason)));
      },
      { once: true }
    );
  });
}

export function installInterruptHandlers(
  target: ProcessSignalTarget,
  signals: readonly InterruptSignalName[] = ["SIGINT", "SIGTERM"]
): InstalledInterruptHandlers {
  const controller = createInterruptController();
  const listeners = signals.map((signal) => ({
    signal,
    listener: () => {
      controller.interrupt(`${signal} received.`);
    }
  }));

  for (const { signal, listener } of listeners) {
    target.once(signal, listener);
  }

  return {
    signal: controller.signal,
    dispose: () => {
      for (const { signal, listener } of listeners) {
        target.off(signal, listener);
      }
    }
  };
}

function formatInterruptedReason(reason: unknown): string {
  if (typeof reason === "string" && reason.length > 0) {
    return reason;
  }

  return "Command interrupted.";
}
