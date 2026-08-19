import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildFileInventory, createLegacyDetector, scanRepository } from "../src/index.js";

describe("Legacy detector", () => {
  it("detects explicit deprecation markers and replacement hints", async () => {
    const root = await createFixture({
      "src/old-api.ts": "// Deprecated: replaced by src/new-api.ts\nexport const oldApi = true;\n",
      "src/new-api.ts": "export const newApi = true;\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["src/old-api.ts", "src/new-api.ts"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createLegacyDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "legacy.marker_detected",
          confidence: "high",
          value: expect.objectContaining({
            target: "src/old-api.ts",
            marker: "deprecated",
            replacement: "src/new-api.ts",
            reviewed: false
          })
        }),
        expect.objectContaining({
          kind: "legacy.replacement_detected",
          confidence: "high",
          value: {
            target: "src/old-api.ts",
            replacement: "src/new-api.ts",
            source: "src/old-api.ts"
          }
        })
      ])
    );
  });

  it("emits low-confidence legacy path and unused export candidates with caveats", async () => {
    const root = await createFixture({
      "src/legacy/client.ts": "export function LegacyClient() { return null; }\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["src/legacy/client.ts"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createLegacyDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "legacy.path_candidate_detected",
          confidence: "low",
          value: expect.objectContaining({
            path: "src/legacy/client.ts",
            reviewed: false
          })
        }),
        expect.objectContaining({
          kind: "legacy.symbol_candidate_detected",
          confidence: "low",
          value: expect.objectContaining({
            symbol: "LegacyClient",
            caveat: expect.stringContaining("false positives"),
            reviewed: false
          })
        })
      ])
    );
  });

  it("detects stale scripts and missing documentation references", async () => {
    const root = await createFixture({
      "package.json": JSON.stringify({
        scripts: {
          "legacy:worker": "tsx scripts/missing-worker.ts"
        }
      }),
      "AGENTS.md": "Run `scripts/missing-worker.ts` only if needed.\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["package.json", "AGENTS.md"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createLegacyDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "legacy.command_candidate_detected",
          confidence: "medium",
          value: expect.objectContaining({
            command: "tsx scripts/missing-worker.ts",
            reviewed: false
          })
        }),
        expect.objectContaining({
          kind: "legacy.path_candidate_detected",
          confidence: "low",
          value: expect.objectContaining({
            path: "scripts/missing-worker.ts",
            source: "AGENTS.md",
            reviewed: false
          })
        })
      ])
    );
  });

  it("does not emit high-confidence findings for versioned paths without explicit markers", async () => {
    const root = await createFixture({
      "src/v1/api.ts": "export const stablePublicApi = true;\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["src/v1/api.ts"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createLegacyDetector()]
    });

    expect(result.facts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          confidence: "high"
        })
      ])
    );
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-legacy-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
