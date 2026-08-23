import { describe, expect, it } from "vitest";

import { resolveVerificationComponentImpact } from "../src/index.js";

describe("@repo-knowledge/verification-runtime component impact", () => {
  it("collects application, service, and rule component ids conservatively", () => {
    const impact = resolveVerificationComponentImpact({
      contract: {
        version: 1,
        repository: {
          name: "demo",
          type: "application",
          primary_language: "typescript"
        },
        applications: {
          api: {
            id: "api",
            type: "api",
            working_directory: "apps/api",
            command: { command: "pnpm", args: ["start"] }
          }
        },
        services: {
          postgres: {
            id: "postgres",
            type: "postgresql"
          }
        },
        related_repositories: [],
        external_systems: [],
        known_limitations: [],
        verification: {
          default: [],
          rules: [
            {
              id: "api-tests",
              paths: ["apps/api/**"],
              components: ["api"],
              checks: [
                {
                  id: "test-api",
                  command: { command: "pnpm", args: ["test"] },
                  components: ["api"]
                }
              ]
            }
          ]
        }
      },
      changedPaths: ["apps/api/src/routes.ts"],
      explicitComponentIds: ["api"]
    });

    expect(impact.knownComponentIds).toEqual(["api", "postgres"]);
    expect(impact.impactedComponentIds).toEqual(["api"]);
    expect(impact.matchedRuleIds).toEqual(["api-tests"]);
    expect(impact.matchedCheckIds).toEqual(["test-api"]);
  });
});
