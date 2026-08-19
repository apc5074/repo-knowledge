import { chmod, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { InitArtifactProposal } from "./result.js";

export class ArtifactWriteConflictError extends Error {
  readonly path: string;
  readonly action: InitArtifactProposal["action"];

  constructor(path: string, action: InitArtifactProposal["action"], message: string) {
    super(message);
    this.name = "ArtifactWriteConflictError";
    this.path = path;
    this.action = action;
  }
}

export type ArtifactWriteResult = {
  readonly written: readonly string[];
  readonly skipped: readonly string[];
};

export async function writeArtifactProposals(input: {
  readonly repositoryRoot: string;
  readonly artifacts: readonly InitArtifactProposal[];
  readonly force?: boolean;
}): Promise<ArtifactWriteResult> {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const artifact of input.artifacts) {
    if (
      artifact.action === "deferred" ||
      artifact.action === "unchanged" ||
      artifact.action === "skip"
    ) {
      skipped.push(artifact.path);
      continue;
    }

    const target = resolve(input.repositoryRoot, artifact.path);
    assertInsideRoot(input.repositoryRoot, target, artifact);

    if (artifact.action === "create" && artifact.content === undefined) {
      await mkdir(target, { recursive: true });
      written.push(artifact.path);
      continue;
    }

    if (artifact.content === undefined) {
      skipped.push(artifact.path);
      continue;
    }

    await writeFileArtifact({
      target,
      artifact,
      force: input.force ?? false
    });
    written.push(artifact.path);
  }

  return {
    written,
    skipped
  };
}

async function writeFileArtifact(input: {
  readonly target: string;
  readonly artifact: InitArtifactProposal;
  readonly force: boolean;
}): Promise<void> {
  const exists = await pathExists(input.target);

  if (input.artifact.action === "create" && exists && !input.force) {
    throw new ArtifactWriteConflictError(
      input.artifact.path,
      input.artifact.action,
      `${input.artifact.path} already exists; refusing to overwrite without force.`
    );
  }

  if (input.artifact.action === "update" && !exists) {
    throw new ArtifactWriteConflictError(
      input.artifact.path,
      input.artifact.action,
      `${input.artifact.path} does not exist; refusing update.`
    );
  }

  await mkdir(dirname(input.target), { recursive: true });
  const temporaryPath = join(
    dirname(input.target),
    `.${input.artifact.path.split("/").at(-1) ?? "artifact"}.${process.pid}.tmp`
  );

  try {
    await writeFile(temporaryPath, input.artifact.content ?? "", "utf8");

    if (exists) {
      const mode = (await stat(input.target)).mode;
      await chmod(temporaryPath, mode);
    }

    await rename(temporaryPath, input.target);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function assertInsideRoot(
  repositoryRoot: string,
  target: string,
  artifact: InitArtifactProposal
): void {
  const root = resolve(repositoryRoot);

  if (target !== root && !target.startsWith(`${root}/`)) {
    throw new ArtifactWriteConflictError(
      artifact.path,
      artifact.action,
      `${artifact.path} resolves outside the repository root.`
    );
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
