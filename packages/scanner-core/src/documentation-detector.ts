import type { RepositoryDetector } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { createEvidenceFromLocation, findRegexLocation } from "./source-location.js";

const detectorName = "documentation";

export type RepoSkillInfo = {
  readonly name: string;
  readonly path: string;
  readonly referencedPaths: readonly string[];
};

export function createDocumentationDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: [
      "documentation.detected",
      "agent_instruction.detected",
      "repo_skill.detected"
    ],
    filePatterns: [
      "README.md",
      "docs/**",
      "AGENTS.md",
      "CLAUDE.md",
      ".cursorrules",
      ".github/copilot-instructions.md",
      ".board/skills/**/SKILL.md"
    ],
    run: async (context) => {
      const facts: ScannerFact[] = [];

      for (const path of context.inventory.files) {
        const result = await context.readFileIfSafe(path);
        const text = result.ok ? result.text : "";

        if (isDocumentationPath(path)) {
          facts.push(documentationFact(path, text));
        }

        if (isAgentInstructionPath(path)) {
          facts.push(agentInstructionFact(path, text));
        }

        if (isRepoSkillPath(path)) {
          facts.push(repoSkillFact(parseRepoSkill(path, text), text));
        }
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

export function parseRepoSkill(path: string, text: string): RepoSkillInfo {
  return {
    name: path.split("/").at(-2) ?? path.replace(/\/SKILL\.md$/, ""),
    path,
    referencedPaths: [...text.matchAll(/\b(?:references|assets)\/[A-Za-z0-9_./-]+/g)]
      .map((match) => match[0])
      .map((reference) => reference.replace(/[.,;:!?]+$/, ""))
      .sort()
  };
}

function documentationFact(path: string, text: string): ScannerFact {
  return createScannerFact({
    kind: "documentation.detected",
    value: {
      path,
      title: firstHeading(text),
      docType: docType(path)
    },
    confidence: "high",
    detector: detectorName,
    evidence: [evidence(path, text)]
  });
}

function agentInstructionFact(path: string, text: string): ScannerFact {
  return createScannerFact({
    kind: "agent_instruction.detected",
    value: {
      path,
      tool: agentTool(path),
      scope: instructionScope(path)
    },
    confidence: "high",
    detector: detectorName,
    evidence: [evidence(path, text)]
  });
}

function repoSkillFact(skill: RepoSkillInfo, text: string): ScannerFact {
  return createScannerFact({
    kind: "repo_skill.detected",
    value: skill,
    confidence: "high",
    detector: detectorName,
    evidence: [evidence(skill.path, text)]
  });
}

function evidence(path: string, text: string) {
  return createEvidenceFromLocation({
    kind: "documentation",
    sourcePath: path,
    detector: detectorName,
    location: findRegexLocation(text, /^#\s+/) ?? { line_start: 1, line_end: 1 }
  });
}

function isDocumentationPath(path: string): boolean {
  const name = path.split("/").at(-1) ?? path;

  return (
    name === "README.md" ||
    name === "CHANGELOG.md" ||
    name === "CONTRIBUTING.md" ||
    path.startsWith("docs/") ||
    path.endsWith(".mdx")
  );
}

function isAgentInstructionPath(path: string): boolean {
  const name = path.split("/").at(-1) ?? path;

  return (
    name === "AGENTS.md" ||
    name === "CLAUDE.md" ||
    name === ".cursorrules" ||
    path === ".github/copilot-instructions.md" ||
    path.startsWith(".cursor/rules/")
  );
}

function isRepoSkillPath(path: string): boolean {
  return /^\.board\/skills\/[^/]+\/SKILL\.md$/.test(path);
}

function firstHeading(text: string): string | undefined {
  return text.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function docType(path: string): string {
  if (path.endsWith("CHANGELOG.md")) {
    return "changelog";
  }

  if (path.endsWith("CONTRIBUTING.md")) {
    return "contributing";
  }

  if (path.startsWith("docs/")) {
    return "docs";
  }

  return "readme";
}

function agentTool(path: string): string | undefined {
  if (path.endsWith("CLAUDE.md")) {
    return "claude";
  }

  if (path === ".github/copilot-instructions.md") {
    return "copilot";
  }

  if (path === ".cursorrules" || path.startsWith(".cursor/")) {
    return "cursor";
  }

  if (path.endsWith("AGENTS.md")) {
    return "agents";
  }

  return undefined;
}

function instructionScope(path: string): string {
  return path.includes("/") ? path.split("/").slice(0, -1).join("/") : ".";
}

function dedupeFacts(facts: readonly ScannerFact[]): readonly ScannerFact[] {
  const seen = new Set<string>();

  return facts.filter((fact) => {
    const value = fact.value as { path?: string };
    const key = `${fact.kind}:${value.path ?? fact.id}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
