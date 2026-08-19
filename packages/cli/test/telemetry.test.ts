import { describe, expect, it } from "vitest";

import {
  createNoopTelemetryClient,
  sanitizeTelemetryProperties,
  type TelemetryProperties
} from "../src/index.js";

describe("telemetry", () => {
  it("defaults to disabled no-op behavior", async () => {
    const telemetry = createNoopTelemetryClient();

    expect(telemetry.enabled).toBe(false);
    expect(() => telemetry.commandStarted({ command: "status" })).not.toThrow();
    expect(() => telemetry.agentRunStarted({ agent_run_id: "agent-run-1" })).not.toThrow();
    expect(await telemetry.flush()).toBeUndefined();
  });

  it("offers command, agent, approval, proposal, and pull request hooks", () => {
    const events: string[] = [];
    const telemetry = createNoopTelemetryClient({
      enabled: true,
      capture: (event) => {
        events.push(event);
      }
    });

    telemetry.commandStarted({ command: "status" });
    telemetry.commandSucceeded({ command: "status", ok: true });
    telemetry.commandFailed({ command: "doctor", ok: false, error_code: "internal-error" });
    telemetry.agentRunStarted({ agent_run_id: "agent-run-1" });
    telemetry.toolCallCompleted({ tool_call_id: "tool-call-1" });
    telemetry.approvalRequested({ approval_id: "approval-1" });
    telemetry.proposalCreated({ proposal_id: "proposal-1" });
    telemetry.pullRequestOpened({ pull_request_id: "1" });
    telemetry.pullRequestUpdated({ pull_request_id: "1" });

    expect(events).toEqual([
      "command.started",
      "command.completed",
      "command.failed",
      "agent_run.started",
      "tool_call.completed",
      "approval.requested",
      "proposal.created",
      "pull_request.opened",
      "pull_request.updated"
    ]);
  });

  it("filters secret-looking telemetry properties", () => {
    const sanitized = sanitizeTelemetryProperties({
      command: "status",
      token: "secret",
      authToken: "secret",
      password: "secret",
      cookie: "secret",
      duration_ms: 1
    });

    expect(sanitized).toEqual({
      command: "status",
      duration_ms: 1
    });
  });

  it("sanitizes properties before default capture hooks", () => {
    const captured: TelemetryProperties[] = [];
    const telemetry = createNoopTelemetryClient({
      capture: (_event, properties) => {
        captured.push(properties ?? {});
      }
    });

    telemetry.commandStarted({
      command: "status",
      token: "secret"
    });

    expect(captured).toEqual([
      {
        command: "status"
      }
    ]);
  });
});
