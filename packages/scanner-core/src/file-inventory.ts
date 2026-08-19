import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";

import type { ScanWarning } from "./detector.js";
import {
  classifyRepositoryFile,
  isBinaryPath,
  isManifestPath,
  normalizeInventoryPath,
  shouldIgnoreRepositoryPath,
  type RepositoryFileCategory
} from "./ignore.js";

const execFileAsync = promisify(execFile);
const defaultMaxFileSizeBytes = 1_000_000;

export type FileInventorySource = "git" | "filesystem";

export type FileInventoryEntry = {
  readonly path: string;
  readonly absolutePath: string;
  readonly extension: string;
  readonly size_bytes: number;
  readonly category: RepositoryFileCategory;
  readonly manifest: boolean;
  readonly content_safe: boolean;
  readonly skip_reason?: string;
};

export type ScanFileInventory = {
  readonly root?: string;
  readonly source?: FileInventorySource;
  readonly files: readonly string[];
  readonly entries?: readonly FileInventoryEntry[];
  readonly manifests?: readonly FileInventoryEntry[];
  readonly warnings?: readonly ScanWarning[];
  readonly include_untracked?: boolean;
};

export type BuildFileInventoryInput = {
  readonly root: string;
  readonly includeUntracked?: boolean;
  readonly maxFileSizeBytes?: number;
  readonly trackedFiles?: readonly string[];
};

export type InventoryReader = {
  readonly readText: (path: string) => Promise<string>;
  readonly readTextIfSafe: (
    path: string
  ) => Promise<{ ok: true; text: string } | { ok: false; reason: string }>;
};

export async function buildFileInventory(
  input: BuildFileInventoryInput
): Promise<ScanFileInventory> {
  const root = resolve(input.root);
  const maxFileSizeBytes = input.maxFileSizeBytes ?? defaultMaxFileSizeBytes;
  const warnings: ScanWarning[] = [];
  const rootStat = await stat(root);

  if (!rootStat.isDirectory()) {
    throw new Error(`Repository root is not a directory: ${root}`);
  }

  const listed = await listInventoryPaths(root, input);
  const entries: FileInventoryEntry[] = [];

  for (const rawPath of listed.paths) {
    const path = normalizeInventoryPath(rawPath);
    const ignore = shouldIgnoreRepositoryPath(path);

    if (path.length === 0 || ignore.ignored) {
      continue;
    }

    const absolutePath = join(root, path);
    const fileStat = await stat(absolutePath).catch(() => undefined);

    if (!fileStat?.isFile()) {
      continue;
    }

    const category = classifyRepositoryFile(path);
    const tooLarge = fileStat.size > maxFileSizeBytes;
    const binary = category === "binary" || isBinaryPath(path);
    const skipReason = binary
      ? "binary file"
      : tooLarge
        ? "file exceeds scan size limit"
        : undefined;

    if (skipReason) {
      warnings.push({
        message: `Skipped ${path}: ${skipReason}.`,
        path
      });
    }

    entries.push({
      path,
      absolutePath,
      extension: extname(path).toLowerCase(),
      size_bytes: fileStat.size,
      category,
      manifest: isManifestPath(path),
      content_safe: skipReason === undefined,
      skip_reason: skipReason
    });
  }

  entries.sort((left, right) => left.path.localeCompare(right.path));

  return {
    root,
    source: listed.source,
    files: entries.map((entry) => entry.path),
    entries,
    manifests: entries.filter((entry) => entry.manifest),
    warnings,
    include_untracked: input.includeUntracked ?? false
  };
}

export function createInventoryReader(
  inventory: ScanFileInventory,
  options: {
    readonly readFileText?: (path: string) => Promise<string>;
  } = {}
): InventoryReader {
  const root = inventory.root;
  const entries = new Map((inventory.entries ?? []).map((entry) => [entry.path, entry]));
  const cache = new Map<string, Promise<string>>();
  const readFileText =
    options.readFileText ??
    ((path: string) =>
      readFile(path, {
        encoding: "utf8"
      }));
  const readText = async (path: string): Promise<string> => {
    const normalized = normalizeInventoryPath(path);
    const entry = entries.get(normalized);

    if (!entry) {
      throw new Error(`File is not present in the scan inventory: ${normalized}`);
    }

    if (!entry.content_safe) {
      throw new Error(`File is not safe to read during scan: ${normalized}`);
    }

    if (!cache.has(normalized)) {
      cache.set(normalized, readFileText(entry.absolutePath));
    }

    return cache.get(normalized)!;
  };

  return {
    readText,
    async readTextIfSafe(path: string) {
      if (!root && entries.size === 0) {
        return {
          ok: false,
          reason: "inventory does not include file metadata"
        };
      }

      try {
        return {
          ok: true,
          text: await readText(path)
        };
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}

async function listInventoryPaths(
  root: string,
  input: BuildFileInventoryInput
): Promise<{ source: FileInventorySource; paths: readonly string[] }> {
  if (input.trackedFiles) {
    return {
      source: "git",
      paths: input.trackedFiles
    };
  }

  if (!input.includeUntracked) {
    const gitFiles = await listGitTrackedFiles(root);

    if (gitFiles) {
      return {
        source: "git",
        paths: gitFiles
      };
    }
  }

  return {
    source: "filesystem",
    paths: await walkFilesystem(root)
  };
}

async function listGitTrackedFiles(root: string): Promise<readonly string[] | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, "ls-files", "-z"], {
      encoding: "utf8"
    });

    return String(stdout).split("\0").filter(Boolean);
  } catch {
    return undefined;
  }
}

async function walkFilesystem(root: string, directory = root): Promise<readonly string[]> {
  const discovered: string[] = [];
  const children = await readdir(directory, {
    withFileTypes: true
  }).catch(() => []);

  for (const child of children) {
    const absolutePath = join(directory, child.name);
    const relativePath = normalizeInventoryPath(absolutePath.slice(root.length + 1));
    const ignore = shouldIgnoreRepositoryPath(relativePath);

    if (ignore.ignored) {
      continue;
    }

    if (child.isDirectory()) {
      discovered.push(...(await walkFilesystem(root, absolutePath)));
    } else if (child.isFile()) {
      discovered.push(relativePath);
    }
  }

  return discovered;
}
