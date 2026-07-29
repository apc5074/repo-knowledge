import { typesPackage } from "@repo-knowledge/types";

export const webPackage = {
  name: "@repo-knowledge/web",
  phase: typesPackage.phase
} as const;

export type WebAppShell = {
  title: string;
  phase: typeof webPackage.phase;
  requiresApi: false;
  plannedViews: readonly string[];
};

export function createWebAppShell(): WebAppShell {
  return {
    title: "Board",
    phase: webPackage.phase,
    requiresApi: false,
    plannedViews: [
      "repository readiness status",
      "agent run history",
      "artifact proposals",
      "approval queue"
    ]
  };
}
