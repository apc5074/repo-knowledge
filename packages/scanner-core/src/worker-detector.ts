import type { RepositoryDetector } from "./detector.js";
import { parseComposeFile } from "./compose-detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { parseJavaScriptPackageManifest } from "./javascript-manifest.js";
import { parsePythonManifest } from "./python-manifest.js";
import {
  createEvidenceFromLocation,
  findConfigKeyLocation,
  findRegexLocation,
  findStringLocation
} from "./source-location.js";

const detectorName = "worker";

const nodeQueuePackages = new Set(["bullmq", "bull", "bee-queue", "sidequest"]);

export function createWorkerDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["worker.detected"],
    filePatterns: ["package.json", "pyproject.toml", "requirements*.txt", "*.py", "*.ts", "*.js"],
    run: async (context) => {
      const facts: ScannerFact[] = [];

      for (const path of context.inventory.files) {
        if (!isCandidatePath(path)) {
          continue;
        }

        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        facts.push(...workerFactsForFile(path, result.text));
      }

      return {
        facts: dedupeFacts(facts),
        stats: {
          files_considered: context.inventory.files.length,
          facts_emitted: facts.length
        }
      };
    }
  };
}

function workerFactsForFile(path: string, text: string): readonly ScannerFact[] {
  if (path.endsWith("package.json")) {
    return javascriptWorkerFacts(path, text);
  }

  if (isPythonManifestPath(path)) {
    return pythonManifestWorkerFacts(path, text);
  }

  if (isComposePath(path)) {
    return composeWorkerFacts(path, text);
  }

  if (isSourcePath(path)) {
    return sourceWorkerFacts(path, text);
  }

  return [];
}

function javascriptWorkerFacts(path: string, text: string): readonly ScannerFact[] {
  const parsed = parseJavaScriptPackageManifest(path, text);

  if (!parsed.ok) {
    return [];
  }

  const facts: ScannerFact[] = [];
  const dependencies = {
    ...parsed.manifest.dependencies,
    ...parsed.manifest.devDependencies
  };

  for (const packageName of Object.keys(dependencies)) {
    if (nodeQueuePackages.has(packageName)) {
      facts.push(
        workerFact({
          path,
          framework: packageName,
          queue: packageName,
          confidence: "high",
          evidenceText: text,
          evidenceNeedle: packageName
        })
      );
    }
  }

  for (const [name, command] of Object.entries(parsed.manifest.scripts)) {
    if (!isWorkerText(`${name} ${command}`)) {
      continue;
    }

    facts.push(
      workerFact({
        path,
        command,
        confidence: "high",
        evidenceText: text,
        evidenceKey: name
      })
    );
  }

  return facts;
}

function pythonManifestWorkerFacts(path: string, text: string): readonly ScannerFact[] {
  const parsed = parsePythonManifest(path, text);

  if (!parsed.ok) {
    return [];
  }

  return parsed.manifest.dependencies
    .filter((dependency) => dependency.toLowerCase().replaceAll("_", "-") === "celery")
    .map((dependency) =>
      workerFact({
        path,
        framework: "Celery",
        queue: "celery",
        confidence: "high",
        evidenceText: text,
        evidenceNeedle: dependency
      })
    );
}

function composeWorkerFacts(path: string, text: string): readonly ScannerFact[] {
  const parsed = parseComposeFile(path, text);

  if (!parsed.ok) {
    return [];
  }

  return parsed.compose.services
    .filter((service) => isWorkerText(`${service.name} ${service.command ?? ""}`))
    .map((service) =>
      workerFact({
        path,
        service: service.name,
        command: service.command,
        confidence: "high",
        evidenceText: text,
        evidenceNeedle: service.name
      })
    );
}

function sourceWorkerFacts(path: string, text: string): readonly ScannerFact[] {
  const facts: ScannerFact[] = [];
  const nameConfidence = workerPathConfidence(path);

  if (nameConfidence) {
    facts.push(
      workerFact({
        path,
        confidence: nameConfidence,
        evidenceText: text,
        evidenceNeedle: path.split("/").at(-1) ?? path
      })
    );
  }

  if (/from\s+['"]celery['"]|import\s+celery|Celery\s*\(/.test(text)) {
    facts.push(
      workerFact({
        path,
        framework: "Celery",
        queue: "celery",
        confidence: "high",
        evidenceText: text,
        evidencePattern: /from\s+['"]celery['"]|import\s+celery|Celery\s*\(/
      })
    );
  }

  return facts;
}

function workerFact(input: {
  readonly path: string;
  readonly command?: string;
  readonly framework?: string;
  readonly queue?: string;
  readonly service?: string;
  readonly confidence: "high" | "medium" | "low";
  readonly evidenceText: string;
  readonly evidenceKey?: string;
  readonly evidenceNeedle?: string;
  readonly evidencePattern?: RegExp;
}): ScannerFact {
  return createScannerFact({
    kind: "worker.detected",
    value: {
      path: input.path,
      command: input.command,
      framework: input.framework,
      queue: input.queue,
      service: input.service
    },
    confidence: input.confidence,
    detector: detectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: isSourcePath(input.path) ? "source" : "config",
        sourcePath: input.path,
        detector: detectorName,
        location: (input.evidenceKey
          ? findConfigKeyLocation(input.evidenceText, input.evidenceKey)
          : undefined) ??
          (input.evidenceNeedle
            ? findStringLocation(input.evidenceText, input.evidenceNeedle)
            : undefined) ??
          (input.evidencePattern
            ? findRegexLocation(input.evidenceText, input.evidencePattern)
            : undefined) ?? {
            line_start: 1,
            line_end: 1
          }
      })
    ]
  });
}

function workerPathConfidence(path: string): "medium" | "low" | undefined {
  const parts = path.toLowerCase().split("/");
  const file = parts.at(-1) ?? "";

  if (/^(worker|consumer|queue|jobs?)\.[cm]?[jt]sx?$/.test(file) || file === "worker.py") {
    return "medium";
  }

  if (parts.some((part) => /^(workers?|consumers?|queues?|jobs?)$/.test(part))) {
    return "low";
  }

  return undefined;
}

function isCandidatePath(path: string): boolean {
  return (
    path.endsWith("package.json") ||
    isPythonManifestPath(path) ||
    isComposePath(path) ||
    isSourcePath(path)
  );
}

function isPythonManifestPath(path: string): boolean {
  return (
    path.endsWith("pyproject.toml") ||
    path.endsWith("requirements.txt") ||
    path.endsWith("requirements-dev.txt") ||
    path.endsWith("requirements.in")
  );
}

function isComposePath(path: string): boolean {
  const name = path.split("/").at(-1) ?? path;

  return /^(?:docker-)?compose(?:\.[\w-]+)?\.ya?ml$/.test(name);
}

function isSourcePath(path: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(path) || path.endsWith(".py");
}

function isWorkerText(value: string): boolean {
  return /\b(worker|workers|queue|consumer|jobs?|celery\s+.*worker)\b/i.test(value);
}

function dedupeFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  const seen = new Set<string>();

  return facts.filter((fact) => {
    const value = fact.value as {
      path?: string;
      command?: string;
      framework?: string;
      service?: string;
    };
    const key = `${value.path ?? ""}:${value.command ?? ""}:${value.framework ?? ""}:${value.service ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
