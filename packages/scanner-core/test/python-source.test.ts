import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  analyzePythonSource,
  buildFileInventory,
  createPythonFrameworkDetector,
  createPythonSourceDetector,
  scanRepository
} from "../src/index.js";

describe("Python source analysis", () => {
  it("extracts imports, framework declarations, entrypoints, and syntax warnings", () => {
    const analysis = analyzePythonSource(
      "src/main.py",
      [
        "from fastapi import FastAPI",
        "import redis",
        "app = FastAPI()",
        "def broken()",
        'if __name__ == "__main__":',
        "    pass"
      ].join("\n")
    );

    expect(analysis.imports).toEqual([
      {
        module: "fastapi",
        line: 1
      },
      {
        module: "redis",
        line: 2
      }
    ]);
    expect(analysis.declarations).toEqual([
      {
        kind: "fastapi",
        name: "app",
        line: 3
      },
      {
        kind: "main-guard",
        line: 5
      }
    ]);
    expect(analysis.warnings).toEqual([
      {
        detector: "python-source",
        path: "src/main.py",
        message: "Possible Python syntax error on line 4."
      }
    ]);
  });
});

describe("Python framework detector", () => {
  it("detects FastAPI, Flask, Django, Celery, and reusable import framework signals", async () => {
    const root = await createFixture({
      "api/main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      "api/flask_app.py": "from flask import Flask\napp = Flask(__name__)\n",
      "manage.py": "import django\n",
      "worker/tasks.py": "from celery import Celery\ncelery_app = Celery('worker')\n",
      "tests/test_app.py": "import pytest\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: [
        "api/main.py",
        "api/flask_app.py",
        "manage.py",
        "worker/tasks.py",
        "tests/test_app.py"
      ]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createPythonFrameworkDetector()]
    });
    const frameworkFacts = result.facts.filter((fact) => fact.kind === "framework.detected");
    const applicationFacts = result.facts.filter((fact) => fact.kind === "application.detected");

    expect(frameworkFacts.map((fact) => fact.value)).toEqual(
      expect.arrayContaining([
        framework("FastAPI", "fastapi"),
        framework("Flask", "flask"),
        framework("Django", "django"),
        framework("Celery", "celery"),
        framework("pytest", "pytest")
      ])
    );
    expect(frameworkFacts).toHaveLength(5);
    expect(applicationFacts.map((fact) => fact.value)).toEqual(
      expect.arrayContaining([
        {
          name: "app",
          path: "api/main.py",
          kind: "api-service",
          framework: "FastAPI"
        },
        {
          name: "app",
          path: "api/flask_app.py",
          kind: "api-service",
          framework: "Flask"
        },
        {
          name: "django",
          path: "manage.py",
          kind: "api-service",
          framework: "Django"
        },
        {
          name: "celery_app",
          path: "worker/tasks.py",
          kind: "worker",
          framework: "Celery"
        }
      ])
    );
    expect(applicationFacts).toHaveLength(4);
  });
});

describe("Python source detector", () => {
  it("emits entrypoint, database, and cache facts without executing imports", async () => {
    const root = await createFixture({
      "api/main.py": [
        "from fastapi import FastAPI",
        "import asyncpg",
        "import redis",
        "app = FastAPI()",
        'if __name__ == "__main__":',
        "    print('run')"
      ].join("\n"),
      "manage.py": "import django\n",
      "worker.py": "from celery import Celery\ncelery = Celery('worker')\n",
      "broken.py": "def bad()\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["api/main.py", "manage.py", "worker.py", "broken.py"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createPythonSourceDetector()]
    });

    expect(result.warnings).toEqual([
      {
        detector: "python-source",
        path: "broken.py",
        message: "Possible Python syntax error on line 1."
      }
    ]);
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "entrypoint.detected",
          value: {
            path: "api/main.py",
            runtime: "python",
            application: "app",
            kind: "wsgi-asgi-app"
          },
          evidence: [
            expect.objectContaining({
              source_path: "api/main.py",
              line_start: 4
            })
          ]
        }),
        expect.objectContaining({
          kind: "entrypoint.detected",
          value: {
            path: "manage.py",
            runtime: "python",
            application: undefined,
            kind: "django-manage"
          }
        }),
        expect.objectContaining({
          kind: "entrypoint.detected",
          value: {
            path: "worker.py",
            runtime: "python",
            application: "celery",
            kind: "celery-app"
          }
        }),
        expect.objectContaining({
          kind: "database.dependency_detected",
          value: {
            name: "postgresql",
            kind: "database",
            package: "asyncpg"
          }
        }),
        expect.objectContaining({
          kind: "cache.dependency_detected",
          value: {
            name: "redis",
            package: "redis"
          }
        })
      ])
    );
  });
});

function framework(name: string, packageName: string): Record<string, unknown> {
  return {
    name,
    language: "python",
    package: packageName
  };
}

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-python-source-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
