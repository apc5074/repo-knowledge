import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  generateAgentRunId,
  generateSessionId,
  generateToolCallId,
  isBoardIdentifier,
  resolveSessionPath
} from "../src/index.js";

describe("session identifiers", () => {
  it("generates unique filename-safe session and agent identifiers", () => {
    const sessionIds = new Set(Array.from({ length: 20 }, () => generateSessionId()));
    const agentRunId = generateAgentRunId();
    const toolCallId = generateToolCallId();

    expect(sessionIds.size).toBe(20);
    expect([...sessionIds].every((id) => isBoardIdentifier(id))).toBe(true);
    expect(agentRunId).toMatch(/^agent-run-/);
    expect(toolCallId).toMatch(/^tool-call-/);
    expect(isBoardIdentifier(agentRunId)).toBe(true);
    expect(isBoardIdentifier(toolCallId)).toBe(true);
    expect([...sessionIds, agentRunId, toolCallId].every((id) => !id.includes("/"))).toBe(true);
  });

  it("resolves future session file paths without creating runtime state", () => {
    const sessionId = generateSessionId();
    const localState = {
      sessionsRoot: "/tmp/board/sessions"
    };

    expect(resolveSessionPath({ localState, sessionId })).toBe(
      join(localState.sessionsRoot, sessionId, "session.json")
    );
    expect(resolveSessionPath({ localState, sessionId, kind: "events" })).toBe(
      join(localState.sessionsRoot, sessionId, "events.jsonl")
    );
    expect(resolveSessionPath({ localState, sessionId, kind: "lock" })).toBe(
      join(localState.sessionsRoot, sessionId, "session.lock")
    );
  });

  it("rejects unsafe session IDs when resolving paths", () => {
    expect(() =>
      resolveSessionPath({
        localState: {
          sessionsRoot: "/tmp/board/sessions"
        },
        sessionId: "../unsafe"
      })
    ).toThrow("Invalid Board identifier");
  });
});
