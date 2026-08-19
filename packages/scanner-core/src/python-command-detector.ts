import type { RepositoryDetector } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { analyzePythonSource } from "./python-source.js";
import {
  createEvidenceFromLocation,
  findStringLocation,
  type SourceLocation
} from "./source-location.js";

const detectorName = "python-command";

type CommandSignal = {
  readonly name: string;
  readonly command: string;
  readonly category: string;
  readonly cwd: string;
  readonly path: string;
  readonly location?: SourceLocation;
  readonly confidence: "high" | "medium";
};

export function createPythonCommandDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["command.detected"],
    filePatterns: ["pyproject.toml", "Makefile", "justfile", "*.py"],
    run: async (context) => {
      const signals: CommandSignal[] = [];

      for (const path of context.inventory.files) {
        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        if (path.endsWith("pyproject.toml")) {
          signals.push(...pyprojectCommandSignals(path, result.text));
        } else if (isTaskFile(path)) {
          signals.push(...taskFileCommandSignals(path, result.text));
        } else if (path.endsWith(".py")) {
          signals.push(...pythonSourceCommandSignals(path, result.text));
        }
      }

      const facts = dedupeSignals(signals).map(commandFact);

      return {
        facts,
        stats: {
          files_considered: context.inventory.files.length,
          facts_emitted: facts.length
        }
      };
    }
  };
}

function pyprojectCommandSignals(path: string, text: string): readonly CommandSignal[] {
  const signals: CommandSignal[] = [];
  const dependencies = [...text.matchAll(/["']([A-Za-z0-9_.-]+)(?:[<>=!~].*)?["']/g)].map((match) =>
    match[1]?.toLowerCase()
  );

  if (dependencies.includes("pytest")) {
    signals.push(commandSignal("test", "pytest", "test", path, findStringLocation(text, "pytest")));
  }

  if (dependencies.includes("ruff")) {
    signals.push(
      commandSignal("lint", "ruff check .", "lint", path, findStringLocation(text, "ruff"))
    );
  }

  if (dependencies.includes("mypy")) {
    signals.push(
      commandSignal("typecheck", "mypy .", "typecheck", path, findStringLocation(text, "mypy"))
    );
  }

  if (text.includes("alembic")) {
    signals.push(
      commandSignal(
        "migrate",
        "alembic upgrade head",
        "migration",
        path,
        findStringLocation(text, "alembic")
      )
    );
  }

  for (const script of scriptAssignments(text)) {
    signals.push(
      commandSignal(
        script.name,
        script.command,
        classifyCommand(script.name, script.command),
        path,
        script.location
      )
    );
  }

  return signals;
}

function taskFileCommandSignals(path: string, text: string): readonly CommandSignal[] {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const matchedCommand = knownCommandFromLine(line);

      if (!matchedCommand) {
        return undefined;
      }

      return commandSignal(
        matchedCommand.name,
        matchedCommand.command,
        matchedCommand.category,
        path,
        {
          line_start: index + 1,
          line_end: index + 1,
          excerpt: matchedCommand.command
        },
        "medium"
      );
    })
    .filter((signal): signal is CommandSignal => signal !== undefined);
}

function pythonSourceCommandSignals(path: string, text: string): readonly CommandSignal[] {
  const analysis = analyzePythonSource(path, text);
  const module = pythonModuleName(path);
  const signals: CommandSignal[] = [];

  if (path.endsWith("manage.py")) {
    signals.push(
      commandSignal("django:runserver", "python manage.py runserver", "start", path, {
        line_start: 1,
        line_end: 1
      }),
      commandSignal("django:migrate", "python manage.py migrate", "migration", path, {
        line_start: 1,
        line_end: 1
      })
    );
  }

  for (const declaration of analysis.declarations) {
    if (declaration.kind === "fastapi" && declaration.name) {
      signals.push(
        commandSignal(
          "start",
          `uvicorn ${module}:${declaration.name}`,
          "start",
          path,
          { line_start: declaration.line, line_end: declaration.line },
          "medium"
        )
      );
    }

    if (declaration.kind === "celery" && declaration.name) {
      signals.push(
        commandSignal(
          "worker",
          `celery -A ${module} worker`,
          "worker",
          path,
          { line_start: declaration.line, line_end: declaration.line },
          "medium"
        )
      );
    }
  }

  return signals;
}

function commandFact(signal: CommandSignal): ScannerFact {
  return createScannerFact({
    kind: "command.detected",
    value: {
      name: signal.name,
      command: signal.command,
      category: signal.category,
      cwd: signal.cwd
    },
    confidence: signal.confidence,
    detector: detectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: "config",
        sourcePath: signal.path,
        detector: detectorName,
        location: signal.location
      })
    ]
  });
}

function commandSignal(
  name: string,
  command: string,
  category: string,
  path: string,
  location?: SourceLocation,
  confidence: "high" | "medium" = "high"
): CommandSignal {
  return {
    name,
    command,
    category,
    cwd: packageRoot(path),
    path,
    location,
    confidence
  };
}

function scriptAssignments(
  text: string
): readonly { name: string; command: string; location: SourceLocation }[] {
  const scripts: { name: string; command: string; location: SourceLocation }[] = [];
  const scriptSection = text.match(
    /^\[(project\.scripts|tool\.poetry\.scripts)\]\s*\n([\s\S]*?)(?=^\[|$)/m
  );

  if (!scriptSection?.[2]) {
    return scripts;
  }

  for (const [index, line] of scriptSection[2].split(/\r?\n/).entries()) {
    const match = line.match(/^\s*([A-Za-z0-9_.:-]+)\s*=\s*["']([^"']+)["']/);

    if (match?.[1] && match[2]) {
      scripts.push({
        name: match[1],
        command: match[2],
        location: {
          line_start: text.slice(0, scriptSection.index).split(/\r?\n/).length + index + 1,
          line_end: text.slice(0, scriptSection.index).split(/\r?\n/).length + index + 1,
          excerpt: line.trim()
        }
      });
    }
  }

  return scripts;
}

function knownCommandFromLine(
  line: string
): { name: string; command: string; category: string } | undefined {
  const commandMatch = line.match(
    /\b(pytest|ruff check(?: \.)?|mypy(?: \.)?|alembic upgrade head|uvicorn [^\s]+|celery -A [^\s]+ worker)/
  );
  const command = commandMatch?.[0];

  if (!command) {
    return undefined;
  }

  return {
    name: commandName(command),
    command,
    category: classifyCommand(command, command)
  };
}

function commandName(command: string): string {
  if (command.startsWith("ruff")) {
    return "lint";
  }

  if (command.startsWith("mypy")) {
    return "typecheck";
  }

  if (command.startsWith("alembic")) {
    return "migrate";
  }

  if (command.startsWith("uvicorn")) {
    return "start";
  }

  if (command.startsWith("celery")) {
    return "worker";
  }

  return "test";
}

function classifyCommand(name: string, command: string): string {
  const joined = `${name} ${command}`;

  if (/pytest|test/i.test(joined)) {
    return "test";
  }

  if (/ruff|lint/i.test(joined)) {
    return "lint";
  }

  if (/mypy|typecheck/i.test(joined)) {
    return "typecheck";
  }

  if (/migrate|alembic/i.test(joined)) {
    return "migration";
  }

  if (/seed/i.test(joined)) {
    return "seed";
  }

  if (/celery|worker/i.test(joined)) {
    return "worker";
  }

  return "start";
}

function dedupeSignals(signals: readonly CommandSignal[]): readonly CommandSignal[] {
  const seen = new Set<string>();

  return signals.filter((signal) => {
    const key = `${signal.cwd}:${signal.name}:${signal.command}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isTaskFile(path: string): boolean {
  return (
    path === "Makefile" ||
    path.endsWith("/Makefile") ||
    path === "justfile" ||
    path.endsWith("/justfile")
  );
}

function pythonModuleName(path: string): string {
  return path.replace(/\.py$/, "").replaceAll("/", ".");
}

function packageRoot(path: string): string {
  return path.includes("/") ? path.split("/").slice(0, -1).join("/") : ".";
}
