import { describe, expect, it } from "vitest";

import { resolveVerificationEnvironment } from "../src/index.js";

describe("@repo-knowledge/verification-runtime environment resolution", () => {
  it("tracks required and optional variables by check usage", () => {
    const result = resolveVerificationEnvironment({
      contract: {
        version: 1,
        repository: {
          name: "demo",
          type: "application",
          primary_language: "typescript"
        },
        applications: {},
        services: {},
        environment: {
          API_TOKEN: {
            required: true
          }
        },
        related_repositories: [],
        external_systems: [],
        known_limitations: []
      },
      checks: [
        {
          id: "lint",
          source: "default",
          command: {
            command: "pnpm",
            args: ["lint"],
            environment: ["API_TOKEN"]
          },
          paths: [],
          components: [],
          requires: [],
          reason: { kind: "default", details: [] }
        }
      ],
      env: {}
    });

    expect(result.missingRequiredNames).toEqual(["API_TOKEN"]);
    expect(result.blockedCheckIds).toEqual(["lint"]);
  });
});
