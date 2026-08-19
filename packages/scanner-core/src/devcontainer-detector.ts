import type { RepositoryDetector, ScanWarning } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { createEvidenceFromLocation, findConfigKeyLocation } from "./source-location.js";

const detectorName = "devcontainer";

export type DevContainerInfo = {
  readonly path: string;
  readonly name?: string;
  readonly image?: string;
  readonly dockerFile?: string;
  readonly dockerComposeFile?: string | readonly string[];
  readonly features: readonly string[];
  readonly postCreateCommand?: string;
  readonly postStartCommand?: string;
  readonly forwardPorts: readonly number[];
  readonly service?: string;
  readonly workspaceFolder?: string;
};

export type ParseDevContainerResult =
  | { readonly ok: true; readonly devcontainer: DevContainerInfo }
  | { readonly ok: false; readonly warning: ScanWarning };

export function parseDevContainerConfig(path: string, text: string): ParseDevContainerResult {
  try {
    const value = JSON.parse(stripJsonCommentsAndTrailingCommas(text)) as unknown;
    const config = isRecord(value) ? value : {};

    return {
      ok: true,
      devcontainer: {
        path,
        name: stringValue(config.name),
        image: stringValue(config.image),
        dockerFile: stringValue(config.dockerFile),
        dockerComposeFile: composeFileValue(config.dockerComposeFile),
        features: isRecord(config.features) ? Object.keys(config.features).sort() : [],
        postCreateCommand: commandValue(config.postCreateCommand),
        postStartCommand: commandValue(config.postStartCommand),
        forwardPorts: numberList(config.forwardPorts),
        service: stringValue(config.service),
        workspaceFolder: stringValue(config.workspaceFolder)
      }
    };
  } catch (error) {
    return {
      ok: false,
      warning: {
        detector: detectorName,
        path,
        message: `Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`
      }
    };
  }
}

export function createDevContainerDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["devcontainer.detected", "service.detected", "command.detected"],
    filePatterns: [".devcontainer/devcontainer.json", ".devcontainer/*/devcontainer.json"],
    run: async (context) => {
      const facts: ScannerFact[] = [];
      const warnings: ScanWarning[] = [];

      for (const path of context.inventory.files.filter(isDevContainerPath)) {
        const result = await context.readFileIfSafe(path);

        if (!result.ok) {
          continue;
        }

        const parsed = parseDevContainerConfig(path, result.text);

        if (!parsed.ok) {
          warnings.push(parsed.warning);
          continue;
        }

        facts.push(...devContainerFacts(parsed.devcontainer, result.text));
      }

      return {
        facts,
        warnings,
        stats: {
          files_considered: context.inventory.files.length,
          facts_emitted: facts.length
        }
      };
    }
  };
}

function devContainerFacts(info: DevContainerInfo, text: string): readonly ScannerFact[] {
  const facts: ScannerFact[] = [
    createScannerFact({
      kind: "devcontainer.detected",
      value: {
        path: info.path,
        name: info.name,
        image: info.image,
        dockerFile: info.dockerFile,
        dockerComposeFile: info.dockerComposeFile,
        features: info.features,
        forwardPorts: info.forwardPorts,
        service: info.service,
        workspaceFolder: info.workspaceFolder
      },
      confidence: "high",
      detector: detectorName,
      evidence: [configEvidence(info.path, text, "name")]
    })
  ];

  if (info.service) {
    facts.push(
      createScannerFact({
        kind: "service.detected",
        value: {
          name: info.service,
          kind: "devcontainer-service",
          source: "devcontainer"
        },
        confidence: "high",
        detector: detectorName,
        evidence: [configEvidence(info.path, text, "service")]
      })
    );
  }

  if (info.postCreateCommand) {
    facts.push(commandFact(info.path, "postCreateCommand", info.postCreateCommand, text));
  }

  if (info.postStartCommand) {
    facts.push(commandFact(info.path, "postStartCommand", info.postStartCommand, text));
  }

  return facts;
}

function commandFact(path: string, name: string, command: string, text: string): ScannerFact {
  return createScannerFact({
    kind: "command.detected",
    value: {
      name,
      command,
      category: "setup",
      cwd: devContainerRoot(path)
    },
    confidence: "high",
    detector: detectorName,
    evidence: [configEvidence(path, text, name)]
  });
}

function isDevContainerPath(path: string): boolean {
  return /^\.devcontainer\/(?:[^/]+\/)?devcontainer\.json$/.test(path);
}

function composeFileValue(value: unknown): string | readonly string[] | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  return undefined;
}

function commandValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(String).join(" && ");
  }

  if (isRecord(value)) {
    return Object.values(value).map(String).join(" && ");
  }

  return undefined;
}

function numberList(value: unknown): readonly number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "number" ? entry : Number.parseInt(String(entry), 10)))
    .filter(Number.isFinite);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function configEvidence(path: string, text: string, key: string) {
  return createEvidenceFromLocation({
    kind: "config",
    sourcePath: path,
    detector: detectorName,
    location: findConfigKeyLocation(text, key) ?? { line_start: 1, line_end: 1 }
  });
}

function devContainerRoot(path: string): string {
  return path.split("/").slice(0, -1).join("/") || ".";
}

function stripJsonCommentsAndTrailingCommas(text: string): string {
  let output = "";
  let inString = false;
  let stringQuote = "";
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index]!;
    const next = text[index + 1];

    if (inString) {
      output += current;
      escaping = current === "\\" && !escaping;

      if (current === stringQuote && !escaping) {
        inString = false;
        stringQuote = "";
      } else if (current !== "\\") {
        escaping = false;
      }

      continue;
    }

    if (current === '"' || current === "'") {
      inString = true;
      stringQuote = current;
      output += current;
      continue;
    }

    if (current === "/" && next === "/") {
      index = skipUntilLineEnd(text, index);
      output += "\n";
      continue;
    }

    if (current === "/" && next === "*") {
      index = skipUntilBlockCommentEnd(text, index);
      continue;
    }

    output += current;
  }

  return output.replace(/,\s*([}\]])/g, "$1");
}

function skipUntilLineEnd(text: string, index: number): number {
  let cursor = index;

  while (cursor < text.length && text[cursor] !== "\n") {
    cursor += 1;
  }

  return cursor;
}

function skipUntilBlockCommentEnd(text: string, index: number): number {
  let cursor = index + 2;

  while (cursor < text.length) {
    if (text[cursor] === "*" && text[cursor + 1] === "/") {
      return cursor + 1;
    }

    cursor += 1;
  }

  return text.length;
}
