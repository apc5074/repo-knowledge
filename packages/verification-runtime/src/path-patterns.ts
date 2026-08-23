export type PathPatternMatchResult = {
  readonly pattern: string;
  readonly path: string;
  readonly matches: boolean;
};

export type NormalizeRepositoryPathInput = {
  readonly repositoryRoot: string;
  readonly path: string;
};

export function normalizeRepositoryPath(input: NormalizeRepositoryPathInput): string {
  const normalized = input.path.replace(/\\/g, "/");
  const trimmed = normalized.trim();

  if (trimmed.length === 0) {
    throw new Error("Path must not be empty.");
  }

  if (trimmed.startsWith("/") || /^[A-Za-z]:\//.test(trimmed)) {
    throw new Error("Path must be relative to the repository root.");
  }

  const parts: string[] = [];
  for (const part of trimmed.split("/")) {
    if (part.length === 0 || part === ".") {
      continue;
    }

    if (part === "..") {
      if (parts.length === 0) {
        throw new Error("Path must stay within the repository root.");
      }
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  return parts.join("/");
}

export function matchesPathPattern(pattern: string, path: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, "/").trim();
  const normalizedPath = path.replace(/\\/g, "/").trim();

  if (normalizedPattern.length === 0 || normalizedPath.length === 0) {
    return false;
  }

  const regex = new RegExp(`^${convertGlobToRegex(normalizedPattern)}$`);
  return regex.test(normalizedPath);
}

export function matchPathPattern(pattern: string, path: string): PathPatternMatchResult {
  return {
    pattern,
    path,
    matches: matchesPathPattern(pattern, path)
  };
}

function convertGlobToRegex(pattern: string): string {
  let output = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === "*") {
      if (next === "*") {
        output += ".*";
        index += 1;
      } else {
        output += "[^/]*";
      }
      continue;
    }

    if (char === "?") {
      output += "[^/]";
      continue;
    }

    output += escapeRegex(char);
  }

  return output;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
