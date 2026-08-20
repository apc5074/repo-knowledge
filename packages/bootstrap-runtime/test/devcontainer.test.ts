import { parseRepositoryContractObject } from "@repo-knowledge/repository-contract";
import { describe, expect, it } from "vitest";

import { createDevContainerRuntimeReport, detectDevContainerRequirement } from "../src/index.js";

describe("Dev Container runtime detection", () => {
  it("blocks host runtime when Dev Container evidence is marked required", () => {
    const requirement = detectDevContainerRequirement(
      parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "devcontainer-required",
          type: "service",
          primary_language: "typescript"
        },
        source_of_truth_paths: [
          {
            pattern: ".devcontainer/devcontainer.json",
            description: "required runtime environment",
            governs: ["**/*"]
          }
        ]
      })
    );
    const report = createDevContainerRuntimeReport(requirement);

    expect(requirement).toEqual({
      detected: true,
      required: true,
      sourcePaths: [".devcontainer/devcontainer.json"]
    });
    expect(report).toMatchObject({
      status: "failed",
      required: true,
      prerequisites: [
        expect.objectContaining({
          id: "devcontainer",
          command: "devcontainer",
          status: "unknown"
        })
      ],
      errors: [expect.stringContaining("does not start commands inside the container")]
    });
  });

  it("warns but does not block when Dev Container metadata is optional", () => {
    const requirement = detectDevContainerRequirement(
      parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "devcontainer-optional",
          type: "service",
          primary_language: "typescript"
        },
        applications: {
          api: {
            id: "api",
            type: "api",
            evidence: [
              {
                kind: "config",
                source_path: ".devcontainer/devcontainer.json"
              }
            ]
          }
        }
      })
    );
    const report = createDevContainerRuntimeReport(requirement);

    expect(requirement).toEqual({
      detected: true,
      required: false,
      sourcePaths: [".devcontainer/devcontainer.json"]
    });
    expect(report).toMatchObject({
      status: "skipped",
      required: false,
      warnings: [expect.stringContaining("not marked required")]
    });
  });

  it("does nothing when no Dev Container signals exist", () => {
    const requirement = detectDevContainerRequirement(
      parseRepositoryContractObject({
        version: 1,
        repository: {
          name: "host-runtime",
          type: "service",
          primary_language: "typescript"
        }
      })
    );

    expect(createDevContainerRuntimeReport(requirement)).toEqual({
      status: "skipped",
      required: false,
      warnings: [],
      errors: [],
      nextSteps: [],
      prerequisites: []
    });
  });
});
