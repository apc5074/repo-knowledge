import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type WorktreeFileStatus = {
  readonly path: string;
  readonly indexStatus: string;
  readonly workingTreeStatus: string;
};

export type WorktreeStatus = {
  readonly isGitRepository: boolean;
  readonly dirty: boolean;
  readonly modifiedFiles: readonly string[];
  readonly untrackedFiles: readonly string[];
  readonly targetFiles: readonly string[];
  readonly dirtyTargetFiles: readonly string[];
};

export async function getWorktreeStatus(input: {
  readonly repositoryRoot: string;
  readonly targetFiles?: readonly string[];
}): Promise<WorktreeStatus> {
  const targetFiles = [...(input.targetFiles ?? [])].sort();

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", input.repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all"],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024
      }
    );
    const statuses = parseGitStatusPorcelain(stdout);
    const modifiedFiles = statuses
      .filter((status) => status.indexStatus !== "?" || status.workingTreeStatus !== "?")
      .map((status) => status.path)
      .sort();
    const untrackedFiles = statuses
      .filter((status) => status.indexStatus === "?" && status.workingTreeStatus === "?")
      .map((status) => status.path)
      .sort();
    const dirtyTargetFiles = targetFiles
      .filter((target) => modifiedFiles.includes(target) || untrackedFiles.includes(target))
      .sort();

    return {
      isGitRepository: true,
      dirty: statuses.length > 0,
      modifiedFiles,
      untrackedFiles,
      targetFiles,
      dirtyTargetFiles
    };
  } catch {
    return {
      isGitRepository: false,
      dirty: false,
      modifiedFiles: [],
      untrackedFiles: [],
      targetFiles,
      dirtyTargetFiles: []
    };
  }
}

export function worktreeWarnings(status: WorktreeStatus): readonly string[] {
  const warnings: string[] = [];

  if (!status.isGitRepository) {
    warnings.push("Repository is not inside a Git worktree; Git safety checks were skipped.");
    return warnings;
  }

  if (status.dirty) {
    warnings.push(
      `Git worktree has ${status.modifiedFiles.length} modified and ${status.untrackedFiles.length} untracked files.`
    );
  }

  if (status.dirtyTargetFiles.length > 0) {
    warnings.push(
      `Init target files are dirty and will not be overwritten without force: ${status.dirtyTargetFiles.join(", ")}.`
    );
  }

  return warnings;
}

function parseGitStatusPorcelain(stdout: string): readonly WorktreeFileStatus[] {
  return stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const indexStatus = line[0] ?? " ";
      const workingTreeStatus = line[1] ?? " ";
      const path = line.slice(3).replace(/^"|"$/g, "");

      return {
        path,
        indexStatus,
        workingTreeStatus
      };
    });
}
