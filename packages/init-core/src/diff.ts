import type { InitArtifactProposal } from "./result.js";

export type InitArtifactDiff = {
  readonly path: string;
  readonly action: InitArtifactProposal["action"];
  readonly text: string;
};

export function buildArtifactDiff(input: {
  readonly path: string;
  readonly action: InitArtifactProposal["action"];
  readonly before?: string;
  readonly after?: string;
}): InitArtifactDiff {
  const before = input.before ?? "";
  const after = input.after ?? "";

  return {
    path: input.path,
    action: input.action,
    text: unifiedLineDiff({
      before,
      after,
      fromLabel: input.action === "create" ? "/dev/null" : `a/${input.path}`,
      toLabel: input.action === "skip" ? "/dev/null" : `b/${input.path}`
    })
  };
}

export function attachArtifactDiffs(input: {
  readonly artifacts: readonly InitArtifactProposal[];
  readonly existingContentByPath?: Readonly<Record<string, string | undefined>>;
}): readonly InitArtifactProposal[] {
  return input.artifacts.map((artifact) => {
    if (
      artifact.content === undefined ||
      (artifact.action !== "create" && artifact.action !== "update")
    ) {
      return artifact;
    }

    const diff = buildArtifactDiff({
      path: artifact.path,
      action: artifact.action,
      before: input.existingContentByPath?.[artifact.path],
      after: artifact.content
    });

    return {
      ...artifact,
      diff: diff.text
    };
  });
}

function unifiedLineDiff(input: {
  readonly before: string;
  readonly after: string;
  readonly fromLabel: string;
  readonly toLabel: string;
}): string {
  const beforeLines = splitLines(input.before);
  const afterLines = splitLines(input.after);
  const operations = diffLines(beforeLines, afterLines);
  const lines = [`--- ${input.fromLabel}`, `+++ ${input.toLabel}`];

  if (operations.length > 0) {
    lines.push(`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`);
  }

  for (const operation of operations) {
    lines.push(`${operation.kind}${operation.line}`);
  }

  return `${lines.join("\n")}\n`;
}

function diffLines(
  before: readonly string[],
  after: readonly string[]
): readonly { readonly kind: " " | "+" | "-"; readonly line: string }[] {
  const lcs = longestCommonSubsequenceTable(before, after);
  const operations: { kind: " " | "+" | "-"; line: string }[] = [];
  let left = 0;
  let right = 0;

  while (left < before.length && right < after.length) {
    if (before[left] === after[right]) {
      operations.push({ kind: " ", line: before[left] ?? "" });
      left += 1;
      right += 1;
    } else if ((lcs[left + 1]?.[right] ?? 0) >= (lcs[left]?.[right + 1] ?? 0)) {
      operations.push({ kind: "-", line: before[left] ?? "" });
      left += 1;
    } else {
      operations.push({ kind: "+", line: after[right] ?? "" });
      right += 1;
    }
  }

  while (left < before.length) {
    operations.push({ kind: "-", line: before[left] ?? "" });
    left += 1;
  }

  while (right < after.length) {
    operations.push({ kind: "+", line: after[right] ?? "" });
    right += 1;
  }

  return operations;
}

function longestCommonSubsequenceTable(
  before: readonly string[],
  after: readonly string[]
): readonly (readonly number[])[] {
  const table = Array.from({ length: before.length + 1 }, () =>
    Array.from({ length: after.length + 1 }, () => 0)
  );

  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      table[left][right] =
        before[left] === after[right]
          ? (table[left + 1]?.[right + 1] ?? 0) + 1
          : Math.max(table[left + 1]?.[right] ?? 0, table[left]?.[right + 1] ?? 0);
    }
  }

  return table;
}

function splitLines(text: string): readonly string[] {
  const normalized = text.replace(/\r\n/g, "\n");

  if (normalized.length === 0) {
    return [];
  }

  return normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");
}
