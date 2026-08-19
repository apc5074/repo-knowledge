import { describe, expect, it } from "vitest";

import {
  createInventoryReader,
  normalizeDetectorResult,
  runDetector,
  type RepositoryDetector
} from "../src/index.js";

const inventory = {
  files: ["package.json"]
};
const reader = createInventoryReader(inventory);

const context = {
  repositoryRoot: "/tmp/example",
  startedAt: new Date("2026-01-01T00:00:00.000Z"),
  inventory,
  facts: [],
  readFile: reader.readText,
  readFileIfSafe: reader.readTextIfSafe
};

describe("detector interface", () => {
  it("normalizes partial detector results", () => {
    expect(normalizeDetectorResult({})).toEqual({
      facts: [],
      warnings: [],
      errors: [],
      stats: {}
    });
  });

  it("runs successful detectors without stdout or stderr coupling", async () => {
    const detector: RepositoryDetector = {
      name: "package-manager",
      version: "0.0.0",
      emittedFactKinds: ["package_manager.detected"],
      filePatterns: ["package.json"],
      prerequisites: [
        {
          kind: "file",
          value: "package.json"
        }
      ],
      run: (scanContext) => ({
        warnings:
          scanContext.inventory.files.length === 0
            ? [
                {
                  detector: "package-manager",
                  message: "No files available."
                }
              ]
            : [],
        stats: {
          files_considered: scanContext.inventory.files.length
        }
      })
    };

    await expect(runDetector(detector, context)).resolves.toMatchObject({
      detector,
      failed: false,
      result: {
        facts: [],
        warnings: [],
        errors: [],
        stats: {
          files_considered: 1
        }
      }
    });
  });

  it("converts thrown detector failures into recoverable errors", async () => {
    const detector: RepositoryDetector = {
      name: "broken",
      version: "0.0.0",
      emittedFactKinds: ["language.detected"],
      run: () => {
        throw new Error("Boom");
      }
    };

    await expect(runDetector(detector, context)).resolves.toMatchObject({
      detector,
      failed: true,
      result: {
        facts: [],
        warnings: [],
        errors: [
          {
            detector: "broken",
            message: "Boom",
            recoverable: true
          }
        ]
      }
    });
  });
});
