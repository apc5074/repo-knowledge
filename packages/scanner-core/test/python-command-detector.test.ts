import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildFileInventory, createPythonCommandDetector, scanRepository } from "../src/index.js";

describe("Python command detector", () => {
  it("detects quality and migration commands from pyproject dependency evidence", async () => {
    const root = await createFixture({
      "pyproject.toml": [
        "[project]",
        'dependencies = ["pytest", "ruff", "mypy", "alembic"]',
        "",
        "[project.scripts]",
        'serve = "uvicorn api.main:app"'
      ].join("\n")
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["pyproject.toml"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createPythonCommandDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      command("test", "pytest", "test", "."),
      command("lint", "ruff check .", "lint", "."),
      command("typecheck", "mypy .", "typecheck", "."),
      command("migrate", "alembic upgrade head", "migration", "."),
      command("serve", "uvicorn api.main:app", "start", ".")
    ]);
  });

  it("detects commands from Makefile and justfile lines", async () => {
    const root = await createFixture({
      Makefile: "test:\n\tpytest\nlint:\n\truff check .\n",
      justfile: "typecheck:\n    mypy .\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["Makefile", "justfile"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createPythonCommandDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual(
      expect.arrayContaining([
        command("test", "pytest", "test", "."),
        command("lint", "ruff check .", "lint", "."),
        command("typecheck", "mypy .", "typecheck", ".")
      ])
    );
    expect(result.facts).toHaveLength(3);
  });

  it("detects Django, FastAPI, and Celery command candidates from source evidence", async () => {
    const root = await createFixture({
      "api/main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      "manage.py": "import django\n",
      "worker/tasks.py": "from celery import Celery\ncelery_app = Celery('worker')\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: ["api/main.py", "manage.py", "worker/tasks.py"]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createPythonCommandDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      command("start", "uvicorn api.main:app", "start", "api"),
      command("django:runserver", "python manage.py runserver", "start", "."),
      command("django:migrate", "python manage.py migrate", "migration", "."),
      command("worker", "celery -A worker.tasks worker", "worker", "worker")
    ]);
    expect(result.facts[0]?.evidence[0]).toMatchObject({
      source_path: "api/main.py",
      line_start: 2
    });
  });
});

function command(name: string, commandValue: string, category: string, cwd: string) {
  return {
    name,
    command: commandValue,
    category,
    cwd
  };
}

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-python-command-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
