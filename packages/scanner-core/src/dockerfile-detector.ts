import type { RepositoryDetector } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { createEvidenceFromLocation, findRegexLocation } from "./source-location.js";

const detectorName = "dockerfile";

export type DockerfileInfo = {
  readonly path: string;
  readonly baseImages: readonly string[];
  readonly stages: readonly string[];
  readonly exposedPorts: readonly number[];
  readonly workdir?: string;
  readonly command?: string;
  readonly entrypoint?: string;
  readonly copiedManifests: readonly string[];
};

export function parseDockerfile(path: string, text: string): DockerfileInfo {
  const baseImages: string[] = [];
  const stages: string[] = [];
  const exposedPorts: number[] = [];
  const copiedManifests: string[] = [];
  let workdir: string | undefined;
  let command: string | undefined;
  let entrypoint: string | undefined;

  for (const line of text.split(/\r?\n/)) {
    const normalized = line.trim();

    if (normalized.length === 0 || normalized.startsWith("#")) {
      continue;
    }

    const from = normalized.match(/^FROM\s+([^\s]+)(?:\s+AS\s+([^\s]+))?/i);

    if (from?.[1]) {
      baseImages.push(from[1]);
    }

    if (from?.[2]) {
      stages.push(from[2]);
    }

    const expose = normalized.match(/^EXPOSE\s+(.+)/i);

    if (expose?.[1]) {
      exposedPorts.push(
        ...expose[1]
          .split(/\s+/)
          .map((port) => Number.parseInt(port, 10))
          .filter(Number.isFinite)
      );
    }

    workdir = normalized.match(/^WORKDIR\s+(.+)/i)?.[1] ?? workdir;
    command = normalized.match(/^CMD\s+(.+)/i)?.[1] ?? command;
    entrypoint = normalized.match(/^ENTRYPOINT\s+(.+)/i)?.[1] ?? entrypoint;

    const copy = normalized.match(/^(?:COPY|ADD)\s+(.+)/i)?.[1];

    if (copy) {
      copiedManifests.push(...manifestNames(copy));
    }
  }

  return {
    path,
    baseImages,
    stages,
    exposedPorts: [...new Set(exposedPorts)],
    workdir,
    command,
    entrypoint,
    copiedManifests: [...new Set(copiedManifests)].sort()
  };
}

export function createDockerfileDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["dockerfile.detected", "command.detected"],
    filePatterns: ["Dockerfile", "Dockerfile.*"],
    run: async (context) => {
      const facts: ScannerFact[] = [];

      for (const path of context.inventory.files.filter(isDockerfilePath)) {
        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        const parsed = parseDockerfile(path, result.text);
        facts.push(dockerfileFact(parsed, result.text));

        if (parsed.command) {
          facts.push(commandFact(parsed, "docker-cmd", parsed.command, result.text));
        }

        if (parsed.entrypoint) {
          facts.push(commandFact(parsed, "docker-entrypoint", parsed.entrypoint, result.text));
        }
      }

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

function dockerfileFact(info: DockerfileInfo, text: string): ScannerFact {
  return createScannerFact({
    kind: "dockerfile.detected",
    value: {
      path: info.path,
      baseImage: info.baseImages[0],
      baseImages: info.baseImages,
      stages: info.stages,
      exposedPorts: info.exposedPorts,
      workdir: info.workdir,
      command: info.command,
      entrypoint: info.entrypoint,
      copiedManifests: info.copiedManifests
    },
    confidence: "high",
    detector: detectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: "config",
        sourcePath: info.path,
        detector: detectorName,
        location: findRegexLocation(text, /^FROM\s+/i) ?? { line_start: 1, line_end: 1 }
      })
    ]
  });
}

function commandFact(
  info: DockerfileInfo,
  name: string,
  command: string,
  text: string
): ScannerFact {
  return createScannerFact({
    kind: "command.detected",
    value: {
      name,
      command,
      category: "runtime",
      cwd: dockerfileRoot(info.path)
    },
    confidence: "high",
    detector: detectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: "config",
        sourcePath: info.path,
        detector: detectorName,
        location: findRegexLocation(text, name === "docker-cmd" ? /^CMD\s+/i : /^ENTRYPOINT\s+/i)
      })
    ]
  });
}

function isDockerfilePath(path: string): boolean {
  const name = path.split("/").at(-1) ?? path;

  return name === "Dockerfile" || name.startsWith("Dockerfile.");
}

function manifestNames(copyArgs: string): readonly string[] {
  return (
    copyArgs.match(
      /\b(package\.json|pnpm-lock\.yaml|requirements(?:-[\w-]+)?\.txt|pyproject\.toml|uv\.lock|poetry\.lock)\b/g
    ) ?? []
  );
}

function dockerfileRoot(path: string): string {
  return path.includes("/") ? path.split("/").slice(0, -1).join("/") : ".";
}
