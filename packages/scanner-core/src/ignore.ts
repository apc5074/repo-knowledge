import { extname } from "node:path";

export type RepositoryFileCategory =
  | "code"
  | "config"
  | "documentation"
  | "agent-instruction"
  | "generated-managed"
  | "binary"
  | "unknown";

export type IgnoreDecision = {
  readonly ignored: boolean;
  readonly reason?: string;
};

export const defaultIgnoredPathSegments = [
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  "__pycache__"
] as const;

const safeEnvExampleNames = new Set([".env.example", ".env.sample", ".env.template"]);
const manifestNames = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "pyproject.toml",
  "uv.lock",
  "requirements.txt",
  "requirements.in",
  "poetry.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Cargo.lock",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  "README.md",
  "AGENTS.md",
  "CLAUDE.md"
]);
const sourceExtensions = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sql",
  ".swift",
  ".ts",
  ".tsx"
]);
const configExtensions = new Set([".json", ".jsonc", ".toml", ".yaml", ".yml"]);
const binaryExtensions = new Set([
  ".7z",
  ".avif",
  ".db",
  ".dmg",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp4",
  ".pdf",
  ".png",
  ".sqlite",
  ".tar",
  ".tgz",
  ".ttf",
  ".wasm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip"
]);

export function normalizeInventoryPath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/");
}

export function shouldIgnoreRepositoryPath(path: string): IgnoreDecision {
  const normalized = normalizeInventoryPath(path);
  const segments = normalized.split("/");
  const ignoredSegment = segments.find((segment) =>
    defaultIgnoredPathSegments.includes(segment as (typeof defaultIgnoredPathSegments)[number])
  );

  if (ignoredSegment) {
    return {
      ignored: true,
      reason: `ignored path segment: ${ignoredSegment}`
    };
  }

  if (isSensitivePath(normalized)) {
    return {
      ignored: true,
      reason: "sensitive local configuration"
    };
  }

  return {
    ignored: false
  };
}

export function isSensitivePath(path: string): boolean {
  const name = basename(normalizeInventoryPath(path));

  if (safeEnvExampleNames.has(name)) {
    return false;
  }

  return name === ".env" || name.startsWith(".env.");
}

export function isBinaryPath(path: string): boolean {
  return binaryExtensions.has(extname(normalizeInventoryPath(path)).toLowerCase());
}

export function isManifestPath(path: string): boolean {
  const normalized = normalizeInventoryPath(path);
  const name = basename(normalized);

  return (
    manifestNames.has(name) ||
    /^tsconfig(?:\..+)?\.json$/.test(name) ||
    /^(?:vite|next|vitest|eslint|prettier|tailwind|postcss)\.config\./.test(name) ||
    normalized === ".github/copilot-instructions.md" ||
    normalized.startsWith(".github/workflows/") ||
    normalized === ".devcontainer/devcontainer.json"
  );
}

export function classifyRepositoryFile(path: string): RepositoryFileCategory {
  const normalized = normalizeInventoryPath(path);
  const name = basename(normalized);
  const extension = extname(normalized).toLowerCase();

  if (isBinaryPath(normalized)) {
    return "binary";
  }

  if (
    name === "AGENTS.md" ||
    name === "CLAUDE.md" ||
    normalized === ".github/copilot-instructions.md" ||
    normalized.startsWith(".cursor/rules") ||
    normalized.startsWith(".codex/")
  ) {
    return "agent-instruction";
  }

  if (
    name === "README.md" ||
    name === "CHANGELOG.md" ||
    name === "CONTRIBUTING.md" ||
    normalized.startsWith("docs/") ||
    normalized.endsWith(".mdx")
  ) {
    return "documentation";
  }

  if (
    isManifestPath(normalized) ||
    safeEnvExampleNames.has(name) ||
    configExtensions.has(extension)
  ) {
    return "config";
  }

  if (sourceExtensions.has(extension)) {
    return "code";
  }

  if (/generated|__generated__|\.generated\./.test(normalized)) {
    return "generated-managed";
  }

  return "unknown";
}

function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}
