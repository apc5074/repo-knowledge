import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildFileInventory, createWorkerDetector, scanRepository } from "../src/index.js";

describe("Worker detector", () => {
  it("detects Node queue packages and worker scripts", async () => {
    const root = await createFixture({
      "package.json": JSON.stringify({
        scripts: {
          worker: "tsx src/worker.ts",
          dev: "vite"
        },
        dependencies: {
          bullmq: "^5.0.0"
        }
      })
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["package.json"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createWorkerDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "worker.detected",
          confidence: "high",
          value: expect.objectContaining({
            path: "package.json",
            framework: "bullmq",
            queue: "bullmq"
          })
        }),
        expect.objectContaining({
          kind: "worker.detected",
          confidence: "high",
          value: expect.objectContaining({
            path: "package.json",
            command: "tsx src/worker.ts"
          })
        })
      ])
    );
  });

  it("detects Celery from Python manifests and source declarations", async () => {
    const root = await createFixture({
      "requirements.txt": "celery==5.4.0\n",
      "app/worker.py": "from celery import Celery\napp = Celery('tasks')\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["requirements.txt", "app/worker.py"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createWorkerDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "worker.detected",
          confidence: "high",
          value: expect.objectContaining({
            path: "requirements.txt",
            framework: "Celery",
            queue: "celery"
          })
        }),
        expect.objectContaining({
          kind: "worker.detected",
          confidence: "medium",
          value: expect.objectContaining({
            path: "app/worker.py"
          })
        }),
        expect.objectContaining({
          kind: "worker.detected",
          confidence: "high",
          value: expect.objectContaining({
            path: "app/worker.py",
            framework: "Celery"
          })
        })
      ])
    );
  });

  it("detects Compose worker services and ambiguous worker directories", async () => {
    const root = await createFixture({
      "compose.yml": ["services:", "  worker:", "    command: celery -A app worker"].join("\n"),
      "src/jobs/email.ts": "export async function sendEmail() {}"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["compose.yml", "src/jobs/email.ts"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createWorkerDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "worker.detected",
          confidence: "high",
          value: expect.objectContaining({
            path: "compose.yml",
            service: "worker",
            command: "celery -A app worker"
          })
        }),
        expect.objectContaining({
          kind: "worker.detected",
          confidence: "low",
          value: expect.objectContaining({
            path: "src/jobs/email.ts"
          })
        })
      ])
    );
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-worker-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
