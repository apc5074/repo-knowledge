import { describe, expect, it } from "vitest";

import {
  buildCommandResult,
  createCommandContext,
  serializeCommandResult,
  summarizeCommandResult
} from "../src/index.js";

describe("command result model", () => {
  it("builds successful serializable command results", () => {
    const result = buildCommandResult({
      ok: true,
      command: "status",
      summary: "Repository ready",
      data: {
        checks: 3
      },
      session_id: "session-1"
    });

    expect(JSON.parse(serializeCommandResult(result))).toEqual({
      ok: true,
      status: "success",
      command: "status",
      summary: "Repository ready",
      data: {
        checks: 3
      },
      warnings: [],
      errors: [],
      next_steps: [],
      session_id: "session-1",
      review_items: [],
      candidate_findings: []
    });
  });

  it("builds warning and failed results without Error objects", () => {
    const result = buildCommandResult({
      ok: false,
      command: "contract validate",
      summary: "Contract invalid",
      warnings: ["Using explicit config path"],
      errors: [
        {
          code: "contract-invalid",
          message: "repository.type is invalid",
          path: "repository.type"
        }
      ],
      next_steps: ["Fix the contract and rerun validation."],
      session_id: "session-2"
    });

    expect(result.status).toBe("failure");
    expect(result.errors[0]).not.toBeInstanceOf(Error);
    expect(summarizeCommandResult(result)).toContain("Warning: Using explicit config path");
    expect(summarizeCommandResult(result)).toContain("Error: repository.type is invalid");
    expect(summarizeCommandResult(result)).toContain("Next: Fix the contract");
  });

  it("carries agent, proposal, review, and candidate fields", () => {
    const context = createCommandContext({
      sessionId: "session-3",
      agent: {
        agentRunId: "agent-run-1",
        toolCallId: "tool-call-1"
      }
    });
    const result = buildCommandResult({
      ok: true,
      command: "skills list",
      summary: "Found repo skill candidates",
      session_id: context.sessionId,
      agent_run_id: context.agent.agentRunId,
      tool_call_id: context.agent.toolCallId,
      proposal_id: "proposal-1",
      approval_required: true,
      review_items: [
        {
          id: "review-1",
          title: "Approve generated onboarding skill",
          status: "proposal"
        }
      ],
      candidate_findings: [
        {
          id: "candidate-1",
          kind: "repo-skill",
          title: "Local setup skill",
          summary: "Reusable setup instructions were found."
        }
      ]
    });

    expect(result).toMatchObject({
      session_id: "session-3",
      agent_run_id: "agent-run-1",
      tool_call_id: "tool-call-1",
      proposal_id: "proposal-1",
      approval_required: true
    });
    expect(result.review_items).toHaveLength(1);
    expect(result.candidate_findings).toHaveLength(1);
  });
});
