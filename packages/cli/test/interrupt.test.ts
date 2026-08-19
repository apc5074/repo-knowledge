import { describe, expect, it } from "vitest";

import {
  createInterruptController,
  installInterruptHandlers,
  interruptedPromise,
  throwIfInterrupted
} from "../src/index.js";

describe("interrupt handling", () => {
  it("creates an abort signal and maps it to the interrupted error shape", async () => {
    const interrupt = createInterruptController();

    expect(interrupt.signal.aborted).toBe(false);

    interrupt.interrupt("SIGINT received.");

    expect(interrupt.signal.aborted).toBe(true);
    expect(() => interrupt.throwIfInterrupted()).toThrow(
      expect.objectContaining({
        code: "interrupted",
        exitCode: 8,
        message: "SIGINT received."
      })
    );
    await expect(interruptedPromise(interrupt.signal)).rejects.toMatchObject({
      code: "interrupted",
      exitCode: 8
    });
  });

  it("does nothing for active signals", () => {
    const interrupt = createInterruptController();

    expect(() => throwIfInterrupted(interrupt.signal)).not.toThrow();
  });

  it("installs and disposes process signal listeners", () => {
    const listeners = new Map<string, () => void>();
    const removed: string[] = [];
    const target = {
      once: (signal: "SIGINT" | "SIGTERM", listener: () => void) => {
        listeners.set(signal, listener);
      },
      off: (signal: "SIGINT" | "SIGTERM") => {
        removed.push(signal);
      }
    };
    const installed = installInterruptHandlers(target);

    listeners.get("SIGINT")?.();

    expect(installed.signal.aborted).toBe(true);
    expect(installed.signal.reason).toBe("SIGINT received.");

    installed.dispose();

    expect(removed).toEqual(["SIGINT", "SIGTERM"]);
  });
});
