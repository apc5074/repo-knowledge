import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { LocalStatePaths } from "./config/local-state.js";

export type BoardIdentifierKind = "local" | "agent-run" | "tool-call";

export type SessionPathKind = "metadata" | "events" | "lock";

export type SessionPathInput = {
  readonly localState: Pick<LocalStatePaths, "sessionsRoot">;
  readonly sessionId: string;
  readonly kind?: SessionPathKind;
};

const boardIdentifierPattern = /^(local|agent-run|tool-call)-[0-9a-f-]{36}$/;

export function generateSessionId(): string {
  return createBoardIdentifier("local");
}

export function generateAgentRunId(): string {
  return createBoardIdentifier("agent-run");
}

export function generateToolCallId(): string {
  return createBoardIdentifier("tool-call");
}

export function createBoardIdentifier(kind: BoardIdentifierKind): string {
  return `${kind}-${randomUUID()}`;
}

export function isBoardIdentifier(value: string): boolean {
  return boardIdentifierPattern.test(value);
}

export function assertBoardIdentifier(value: string): string {
  if (!isBoardIdentifier(value)) {
    throw new Error(`Invalid Board identifier: ${value}`);
  }

  return value;
}

export function resolveSessionPath(input: SessionPathInput): string {
  assertBoardIdentifier(input.sessionId);

  return join(input.localState.sessionsRoot, input.sessionId, sessionFileName(input.kind));
}

function sessionFileName(kind: SessionPathKind = "metadata"): string {
  if (kind === "events") {
    return "events.jsonl";
  }

  if (kind === "lock") {
    return "session.lock";
  }

  return "session.json";
}
