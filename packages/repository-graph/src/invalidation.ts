import type { GraphSnapshot } from "./graph-store.js";

export type GraphInvalidationPlan = {
  readonly mode: "none" | "incremental" | "full";
  readonly addedPaths: readonly string[];
  readonly changedPaths: readonly string[];
  readonly deletedPaths: readonly string[];
  readonly renamedPaths: readonly { readonly from: string; readonly to: string }[];
  readonly invalidatedNodeIds: readonly string[];
  readonly invalidatedEdgeIds: readonly string[];
  readonly reason?: string;
};

export function planGraphInvalidation(input: {
  readonly previous?: Pick<GraphSnapshot, "nodes" | "edges">;
  readonly currentFingerprints: Readonly<Record<string, string>>;
  readonly changedOnly?: boolean;
}): GraphInvalidationPlan {
  if (!input.previous)
    return {
      mode: "full",
      addedPaths: Object.keys(input.currentFingerprints).sort(),
      changedPaths: [],
      deletedPaths: [],
      renamedPaths: [],
      invalidatedNodeIds: [],
      invalidatedEdgeIds: [],
      reason: "No prior graph snapshot is available."
    };
  const files = input.previous.nodes.filter((node) => node.kind === "file" && node.path);
  const previous = new Map(
    files.flatMap((node) =>
      node.path
        ? [
            [
              node.path,
              {
                id: node.id,
                fingerprint:
                  typeof node.metadata?.fingerprint === "string"
                    ? node.metadata.fingerprint
                    : undefined
              }
            ] as const
          ]
        : []
    )
  );
  if (input.changedOnly && [...previous.values()].some((entry) => entry.fingerprint === undefined))
    return {
      mode: "full",
      addedPaths: [],
      changedPaths: [],
      deletedPaths: [],
      renamedPaths: [],
      invalidatedNodeIds: [],
      invalidatedEdgeIds: [],
      reason: "A prior file fingerprint is missing."
    };
  const addedPaths = Object.keys(input.currentFingerprints)
    .filter((path) => !previous.has(path))
    .sort();
  const deletedPaths = [...previous.keys()]
    .filter((path) => input.currentFingerprints[path] === undefined)
    .sort();
  const changedPaths = [...previous]
    .flatMap(([path, entry]) =>
      input.currentFingerprints[path] !== undefined &&
      entry.fingerprint !== input.currentFingerprints[path]
        ? [path]
        : []
    )
    .sort();
  const renamedPaths = deletedPaths.flatMap((from) => {
    const fingerprint = previous.get(from)?.fingerprint;
    const to = addedPaths.find(
      (path) => fingerprint !== undefined && input.currentFingerprints[path] === fingerprint
    );
    return to ? [{ from, to }] : [];
  });
  const directPaths = new Set([
    ...changedPaths,
    ...deletedPaths,
    ...renamedPaths.flatMap((item) => [item.from, item.to])
  ]);
  const invalidatedNodeIds = files
    .filter((node) => node.path && directPaths.has(node.path))
    .map((node) => node.id)
    .sort();
  const invalidatedEdgeIds = input.previous.edges
    .filter(
      (edge) =>
        invalidatedNodeIds.includes(edge.sourceNodeId) ||
        invalidatedNodeIds.includes(edge.targetNodeId)
    )
    .map((edge) => edge.id)
    .sort();
  return {
    mode: directPaths.size === 0 && addedPaths.length === 0 ? "none" : "incremental",
    addedPaths: addedPaths.filter((path) => !renamedPaths.some((item) => item.to === path)),
    changedPaths,
    deletedPaths: deletedPaths.filter((path) => !renamedPaths.some((item) => item.from === path)),
    renamedPaths,
    invalidatedNodeIds,
    invalidatedEdgeIds
  };
}
