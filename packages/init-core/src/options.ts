export const initializationModes = ["dry-run", "write"] as const;

export type InitializationMode = (typeof initializationModes)[number];

export type InitAgentMetadata = {
  readonly agentRunId?: string;
  readonly toolCallId?: string;
  readonly approvalId?: string;
};

export type InitializeRepositoryOptions = {
  readonly root: string;
  readonly mode?: InitializationMode;
  readonly force?: boolean;
  readonly skipScripts?: boolean;
  readonly contractPath?: string;
  readonly includeUntracked?: boolean;
  readonly agent?: InitAgentMetadata;
};

export function normalizeInitializeRepositoryOptions(
  options: InitializeRepositoryOptions
): Required<Omit<InitializeRepositoryOptions, "contractPath" | "agent">> &
  Pick<InitializeRepositoryOptions, "contractPath" | "agent"> {
  return {
    root: options.root,
    mode: options.mode ?? "dry-run",
    force: options.force ?? false,
    skipScripts: options.skipScripts ?? false,
    includeUntracked: options.includeUntracked ?? false,
    contractPath: options.contractPath,
    agent: options.agent
  };
}
