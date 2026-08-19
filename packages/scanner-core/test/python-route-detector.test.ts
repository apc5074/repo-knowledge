import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildFileInventory, createPythonRouteDetector, scanRepository } from "../src/index.js";

describe("Python route detector", () => {
  it("detects FastAPI, Flask, and Django route files", async () => {
    const root = await createFixture({
      "api/main.py": "@app.get('/health')\ndef health():\n    return {}\n",
      "api/flask_app.py": "@app.route('/login')\ndef login():\n    return 'ok'\n",
      "project/urls.py": "from django.urls import path\nurlpatterns = [path('admin/', view)]\n",
      "api/service.py": "def helper():\n    return None\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["api/main.py", "api/flask_app.py", "project/urls.py", "api/service.py"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createPythonRouteDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual(
      expect.arrayContaining([
        {
          path: "api/main.py",
          framework: "FastAPI",
          route: "/health"
        },
        {
          path: "api/flask_app.py",
          framework: "Flask",
          route: "/login"
        },
        {
          path: "project/urls.py",
          framework: "Django",
          route: "admin/"
        }
      ])
    );
    expect(result.facts).toHaveLength(3);
    const fastApiRoute = result.facts.find(
      (fact) => (fact.value as { path?: string }).path === "api/main.py"
    );

    expect(fastApiRoute?.evidence[0]).toMatchObject({
      source_path: "api/main.py",
      line_start: 1
    });
  });

  it("reports syntax warnings as recoverable and still emits other route facts", async () => {
    const root = await createFixture({
      "api/main.py": "@router.post('/users')\ndef users()\n",
      "project/urls.py": "urlpatterns = []\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["api/main.py", "project/urls.py"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createPythonRouteDetector()]
    });

    expect(result.warnings).toEqual([
      {
        detector: "python-route-file",
        path: "api/main.py",
        message: "Possible Python syntax error on line 2."
      }
    ]);
    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        path: "api/main.py",
        framework: "FastAPI",
        route: "/users"
      },
      {
        path: "project/urls.py",
        framework: "Django",
        route: undefined
      }
    ]);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-python-route-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
