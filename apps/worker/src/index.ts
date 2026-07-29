import { typesPackage } from "@repo-knowledge/types";

export const workerPackage = {
  name: "@repo-knowledge/worker",
  phase: typesPackage.phase
} as const;

export type WorkerBootResult = {
  name: typeof workerPackage.name;
  phase: typeof workerPackage.phase;
  started: false;
  responsibilities: readonly string[];
};

export function bootWorker(): WorkerBootResult {
  return {
    name: workerPackage.name,
    phase: workerPackage.phase,
    started: false,
    responsibilities: [
      "hosted indexing jobs",
      "readiness checks",
      "GitHub webhook follow-up work",
      "agent maintenance job dispatch"
    ]
  };
}
