import { describe, expect, it } from "vitest";

import { matchStaleWorkflowCandidates } from "../src/index.js";
import type { ScannerFact } from "@repo-knowledge/scanner-core";

describe("stale workflow matcher", () => {
  it("detects stale documented commands and replacement hints", async () => {
    const result = await matchStaleWorkflowCandidates({
      facts: [commandFact("pnpm old-test", "documentation")],
      activeCommands: ["pnpm"],
      detectedAt: "2026-01-01T00:00:00.000Z",
      replacementHints: {
        pnpm: "pnpm test"
      }
    });

    expect(result.candidates).toEqual([
      expect.objectContaining({
        target: {
          kind: "command",
          value: "pnpm old-test"
        },
        confidence: "medium",
        replacementHints: ["pnpm test"],
        status: "unreviewed"
      })
    ]);
  });

  it("detects deprecated command aliases that point at removed paths", async () => {
    const result = await matchStaleWorkflowCandidates({
      facts: [
        {
          ...commandFact("node scripts/old-runner.js", "config"),
          kind: "legacy.command_candidate_detected",
          value: {
            command: "node scripts/old-runner.js",
            signal: "script name looks legacy",
            caveat: "One or more referenced paths are not present in tracked files."
          }
        }
      ],
      activeCommands: ["node"]
    });

    expect(result.candidates).toEqual([
      expect.objectContaining({
        target: {
          kind: "command",
          value: "node scripts/old-runner.js"
        },
        counterEvidence: [
          expect.objectContaining({
            path: "scripts/old-runner.js"
          })
        ]
      })
    ]);
  });

  it("suppresses active commands and manual external prerequisites", async () => {
    await expect(
      matchStaleWorkflowCandidates({
        facts: [
          commandFact("pnpm test", "config"),
          {
            ...commandFact("brew install postgres", "documentation"),
            value: {
              command: "brew install postgres",
              source: "manual external prerequisite"
            }
          }
        ],
        activeCommands: ["pnpm", "brew"]
      })
    ).resolves.toEqual({
      candidates: [],
      warnings: []
    });
  });
});

function commandFact(command: string, evidenceKind: "config" | "documentation"): ScannerFact {
  return {
    id: `fact-${command.replace(/\s+/g, "-")}`,
    kind: "command.detected",
    value: {
      command,
      source: evidenceKind
    },
    confidence: "medium",
    source: "deterministic",
    detector: "docs",
    evidence: [
      {
        kind: evidenceKind,
        source_path: evidenceKind === "documentation" ? "README.md" : "package.json",
        line_start: 1,
        detector: "docs",
        excerpt: command
      }
    ]
  };
}
