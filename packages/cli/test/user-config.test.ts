import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadUserConfig, resolveUserConfigPath } from "../src/index.js";

describe("user config", () => {
  it("uses safe defaults when no config file exists", async () => {
    const dataHome = join(tmpdir(), `board-user-config-data-${randomUUID()}`);
    const result = await loadUserConfig({
      env: {
        HOME: "/unused",
        BOARD_DATA_HOME: dataHome
      },
      platform: "linux"
    });

    expect(result).toEqual({
      path: join(dataHome, "config.json"),
      exists: false,
      config: {
        telemetryEnabled: false,
        defaultOutputMode: "human",
        hostedApiUrl: undefined,
        updateChecks: false
      }
    });
  });

  it("resolves explicit and environment config paths", () => {
    const explicitPath = join(tmpdir(), `board-explicit-${randomUUID()}.json`);
    const envPath = join(tmpdir(), `board-env-${randomUUID()}.json`);

    expect(resolveUserConfigPath({ configPath: explicitPath })).toBe(explicitPath);
    expect(
      resolveUserConfigPath({
        env: {
          BOARD_CONFIG_PATH: envPath
        }
      })
    ).toBe(envPath);
  });

  it("loads supported config keys from a JSON file", async () => {
    const configPath = await writeConfig("complete", {
      telemetryEnabled: true,
      defaultOutputMode: "json",
      hostedApiUrl: "http://localhost:8000",
      updateChecks: true
    });

    await expect(loadUserConfig({ configPath })).resolves.toEqual({
      path: configPath,
      exists: true,
      config: {
        telemetryEnabled: true,
        defaultOutputMode: "json",
        hostedApiUrl: "http://localhost:8000",
        updateChecks: true
      }
    });
  });

  it("applies environment overrides over config file values", async () => {
    const configPath = await writeConfig("env-overrides", {
      telemetryEnabled: false,
      defaultOutputMode: "human",
      hostedApiUrl: "http://localhost:8000",
      updateChecks: false
    });

    await expect(
      loadUserConfig({
        configPath,
        env: {
          BOARD_TELEMETRY: "true",
          BOARD_OUTPUT: "json",
          BOARD_API_URL: "https://board.example.test",
          BOARD_UPDATE_CHECKS: "yes"
        }
      })
    ).resolves.toMatchObject({
      config: {
        telemetryEnabled: true,
        defaultOutputMode: "json",
        hostedApiUrl: "https://board.example.test",
        updateChecks: true
      }
    });
  });

  it("rejects invalid config files clearly", async () => {
    const directory = join(tmpdir(), `board-user-config-invalid-${randomUUID()}`);
    const configPath = join(directory, "config.json");

    await mkdir(directory, { recursive: true });
    await writeFile(configPath, "{invalid-json", "utf8");

    await expect(loadUserConfig({ configPath })).rejects.toMatchObject({
      code: "usage-error"
    });
  });

  it("does not expose unsupported secret-looking config keys", async () => {
    const configPath = await writeConfig("secret-key", {
      telemetryEnabled: true,
      authToken: "do-not-keep-this"
    });
    const result = await loadUserConfig({ configPath });

    expect("authToken" in result.config).toBe(false);
  });
});

async function writeConfig(name: string, config: unknown): Promise<string> {
  const directory = join(tmpdir(), `board-user-config-${name}-${randomUUID()}`);
  const configPath = join(directory, "config.json");

  await mkdir(directory, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  return configPath;
}
