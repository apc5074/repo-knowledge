import { typesPackage } from "@repo-knowledge/types";

export const agentOrchestratorPackage = {
  name: "@repo-knowledge/agent-orchestrator",
  owns: "agent-run-boundaries",
  phase: typesPackage.phase
} as const;

export const plannedMaintenanceAgents = [
  "scanner",
  "contract",
  "bootstrap",
  "documentation",
  "context",
  "verification",
  "drift",
  "known-problem",
  "pr",
  "policy-safety"
] as const;

export type PlannedMaintenanceAgent = (typeof plannedMaintenanceAgents)[number];

export const agentOrchestratorBoundary = {
  owns: ["agent run lifecycle", "workflow routing", "agent state transitions"],
  doesNotOwn: ["direct shell execution", "unrestricted filesystem writes", "model provider calls"]
} as const;
