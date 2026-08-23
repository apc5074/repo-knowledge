import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitChangeSet = {
  readonly repositoryRoot: string;
  readonly baseRef: string;
  readonly headRef: string;
  readonly changedPaths: readonly string[];
  readonly warnings: readonly string[];
};

export type DetectGitChangeSetInput = {
  readonly repositoryRoot: string;
  readonly baseRef?: string;
};

export async function detectGitChangeSet(
  input: DetectGitChangeSetInput
): Promise<GitChangeSet | undefined> {
  const baseRef = input.baseRef ?? "HEAD";

  try {
    await execFileAsync("git", ["-C", input.repositoryRoot, "rev-parse", "--is-inside-work-tree"]);
  } catch {
    return undefined;
  }

  const [diffResult, statusResult] = await Promise.all([
    execFileAsync(
      "git",
      ["-C", input.repositoryRoot, "diff", "--name-only", "--diff-filter=ACDMRTUXB", baseRef],
      { maxBuffer: 1024 * 1024 }
    ),
    execFileAsync("git", ["-C", input.repositoryRoot, "status", "--porcelain=v1", "-z"], {
      maxBuffer: 1024 * 1024
    })
  ]);

  const diffPaths = diffResult.stdout.split("\n");
  const statusPaths = parseStatusOutput(statusResult.stdout);

  const changedPaths = [...diffPaths, ...statusPaths]
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();

  return {
    repositoryRoot: input.repositoryRoot,
    baseRef,
    headRef: "HEAD",
    changedPaths,
    warnings: []
  };
}

function parseStatusOutput(output: string): readonly string[] {
  const paths: string[] = [];
  const entries = output.split("\0").filter((entry) => entry.length > 0);

  for (const entry of entries) {
    const path = entry.slice(3).trim();
    if (path.length > 0) {
      paths.push(path.includes(" -> ") ? (path.split(" -> ").at(-1) ?? path) : path);
    }
  }

  return paths;
}
