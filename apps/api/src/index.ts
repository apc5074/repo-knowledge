import { typesPackage } from "@repo-knowledge/types";

export const apiPackage = {
  name: "@repo-knowledge/api",
  phase: typesPackage.phase
} as const;

export type ApiHealth = {
  readonly status: "ok";
  readonly service: "@repo-knowledge/api";
  readonly phase: "phase-0-placeholder";
  readonly dependencies: {
    readonly postgres: "not-required";
    readonly redis: "not-required";
    readonly objectStorage: "not-required";
  };
};

export function getApiHealth(): ApiHealth {
  return {
    status: "ok",
    service: "@repo-knowledge/api",
    phase: "phase-0-placeholder",
    dependencies: {
      postgres: "not-required",
      redis: "not-required",
      objectStorage: "not-required"
    }
  };
}
