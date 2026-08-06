import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { usageError } from "../errors/board-error.js";
import { resolveLocalStatePaths } from "./local-state.js";

export type BoardOutputModePreference = "human" | "json";

export type UserConfig = {
  readonly telemetryEnabled: boolean;
  readonly defaultOutputMode: BoardOutputModePreference;
  readonly hostedApiUrl?: string;
  readonly updateChecks: boolean;
};

export type ResolveUserConfigInput = {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly configPath?: string;
};

export type ResolvedUserConfig = {
  readonly path: string;
  readonly exists: boolean;
  readonly config: UserConfig;
};

export const defaultUserConfig: UserConfig = {
  telemetryEnabled: false,
  defaultOutputMode: "human",
  updateChecks: false
};

export function resolveUserConfigPath(input: ResolveUserConfigInput = {}): string {
  const env = input.env ?? process.env;

  if (input.configPath !== undefined && input.configPath.length > 0) {
    return resolve(input.configPath);
  }

  if (env.BOARD_CONFIG_PATH !== undefined && env.BOARD_CONFIG_PATH.length > 0) {
    return resolve(env.BOARD_CONFIG_PATH);
  }

  return join(
    resolveLocalStatePaths({
      env,
      platform: input.platform
    }).dataRoot,
    "config.json"
  );
}

export async function loadUserConfig(
  input: ResolveUserConfigInput = {}
): Promise<ResolvedUserConfig> {
  const env = input.env ?? process.env;
  const path = resolveUserConfigPath(input);
  const fileConfig = await readConfigFile(path);

  return {
    path,
    exists: fileConfig.exists,
    config: applyEnvironmentOverrides(fileConfig.config, env)
  };
}

async function readConfigFile(
  path: string
): Promise<{ readonly exists: boolean; readonly config: UserConfig }> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text) as unknown;

    return {
      exists: true,
      config: parseUserConfigObject(parsed, path)
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        exists: false,
        config: defaultUserConfig
      };
    }

    if (error instanceof SyntaxError) {
      throw usageError(`Invalid Board config JSON at ${path}.`, [
        "Fix the JSON syntax or remove the config file."
      ]);
    }

    throw error;
  }
}

function parseUserConfigObject(input: unknown, path: string): UserConfig {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw usageError(`Invalid Board config at ${path}: expected a JSON object.`);
  }

  const config = input as Record<string, unknown>;

  return {
    telemetryEnabled: readBoolean(
      config.telemetryEnabled,
      defaultUserConfig.telemetryEnabled,
      path
    ),
    defaultOutputMode: readOutputMode(
      config.defaultOutputMode,
      defaultUserConfig.defaultOutputMode,
      path
    ),
    hostedApiUrl: readOptionalString(config.hostedApiUrl, path),
    updateChecks: readBoolean(config.updateChecks, defaultUserConfig.updateChecks, path)
  };
}

function applyEnvironmentOverrides(config: UserConfig, env: NodeJS.ProcessEnv): UserConfig {
  return {
    telemetryEnabled:
      env.BOARD_TELEMETRY === undefined
        ? config.telemetryEnabled
        : parseBooleanEnv("BOARD_TELEMETRY", env.BOARD_TELEMETRY),
    defaultOutputMode:
      env.BOARD_OUTPUT === undefined
        ? config.defaultOutputMode
        : parseOutputModeEnv(env.BOARD_OUTPUT),
    hostedApiUrl:
      env.BOARD_API_URL !== undefined && env.BOARD_API_URL.length > 0
        ? env.BOARD_API_URL
        : config.hostedApiUrl,
    updateChecks:
      env.BOARD_UPDATE_CHECKS === undefined
        ? config.updateChecks
        : parseBooleanEnv("BOARD_UPDATE_CHECKS", env.BOARD_UPDATE_CHECKS)
  };
}

function readBoolean(value: unknown, fallback: boolean, path: string): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  throw usageError(`Invalid Board config at ${path}: expected boolean values.`);
}

function readOutputMode(
  value: unknown,
  fallback: BoardOutputModePreference,
  path: string
): BoardOutputModePreference {
  if (value === undefined) {
    return fallback;
  }

  if (value === "human" || value === "json") {
    return value;
  }

  throw usageError(`Invalid Board config at ${path}: defaultOutputMode must be human or json.`);
}

function readOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  throw usageError(`Invalid Board config at ${path}: hostedApiUrl must be a string.`);
}

function parseBooleanEnv(name: string, value: string): boolean {
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  throw usageError(`${name} must be true or false.`);
}

function parseOutputModeEnv(value: string): BoardOutputModePreference {
  if (value === "human" || value === "json") {
    return value;
  }

  throw usageError("BOARD_OUTPUT must be human or json.");
}

function isMissingFileError(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
