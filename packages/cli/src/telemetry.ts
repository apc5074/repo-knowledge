export type TelemetryProperties = Record<string, unknown>;

export type CommandTelemetryProperties = TelemetryProperties & {
  readonly command: string;
  readonly session_id?: string;
  readonly duration_ms?: number;
  readonly ok?: boolean;
  readonly error_code?: string;
};

export type TelemetryClient = {
  readonly enabled: boolean;
  readonly capture: (event: string, properties?: TelemetryProperties) => void;
  readonly commandStarted: (properties: CommandTelemetryProperties) => void;
  readonly commandSucceeded: (properties: CommandTelemetryProperties) => void;
  readonly commandFailed: (properties: CommandTelemetryProperties) => void;
  readonly agentRunStarted: (properties: TelemetryProperties) => void;
  readonly toolCallCompleted: (properties: TelemetryProperties) => void;
  readonly approvalRequested: (properties: TelemetryProperties) => void;
  readonly proposalCreated: (properties: TelemetryProperties) => void;
  readonly pullRequestOpened: (properties: TelemetryProperties) => void;
  readonly pullRequestUpdated: (properties: TelemetryProperties) => void;
  readonly flush: () => void | Promise<void>;
};

export type TelemetryClientInput = Partial<Omit<TelemetryClient, "enabled">> & {
  readonly enabled?: boolean;
};

export function createNoopTelemetryClient(input: TelemetryClientInput = {}): TelemetryClient {
  const enabled = input.enabled ?? false;
  const capture = input.capture ?? noopCapture;

  return {
    enabled,
    capture,
    commandStarted:
      input.commandStarted ??
      ((properties) => {
        capture("command.started", sanitizeTelemetryProperties(properties));
      }),
    commandSucceeded:
      input.commandSucceeded ??
      ((properties) => {
        capture("command.completed", sanitizeTelemetryProperties(properties));
      }),
    commandFailed:
      input.commandFailed ??
      ((properties) => {
        capture("command.failed", sanitizeTelemetryProperties(properties));
      }),
    agentRunStarted:
      input.agentRunStarted ??
      ((properties) => {
        capture("agent_run.started", sanitizeTelemetryProperties(properties));
      }),
    toolCallCompleted:
      input.toolCallCompleted ??
      ((properties) => {
        capture("tool_call.completed", sanitizeTelemetryProperties(properties));
      }),
    approvalRequested:
      input.approvalRequested ??
      ((properties) => {
        capture("approval.requested", sanitizeTelemetryProperties(properties));
      }),
    proposalCreated:
      input.proposalCreated ??
      ((properties) => {
        capture("proposal.created", sanitizeTelemetryProperties(properties));
      }),
    pullRequestOpened:
      input.pullRequestOpened ??
      ((properties) => {
        capture("pull_request.opened", sanitizeTelemetryProperties(properties));
      }),
    pullRequestUpdated:
      input.pullRequestUpdated ??
      ((properties) => {
        capture("pull_request.updated", sanitizeTelemetryProperties(properties));
      }),
    flush: input.flush ?? noopFlush
  };
}

export function sanitizeTelemetryProperties(
  properties: TelemetryProperties = {}
): TelemetryProperties {
  return Object.fromEntries(
    Object.entries(properties).filter(([key]) => !isSecretTelemetryKey(key))
  );
}

function isSecretTelemetryKey(key: string): boolean {
  const normalized = key.toLowerCase();

  return (
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("authorization") ||
    normalized.includes("cookie")
  );
}

function noopCapture(): void {}

function noopFlush(): void {}
