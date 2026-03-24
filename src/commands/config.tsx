import React from "react";
import { Box, Text, render } from "ink";
import { loadConfig, saveConfig, resetConfig, getConfigFile, configExists } from "../config/store.js";
import { mask } from "../config/encrypt.js";
import { PLATFORM_NAMES } from "../config/schema.js";

const SECRET_FIELDS = new Set([
  "bot_token", "api_key", "api_secret", "access_token",
  "access_secret", "app_password", "integration_token", "url",
]);

function maskValue(key: string, value: unknown): string {
  if (typeof value === "string" && SECRET_FIELDS.has(key)) {
    return mask(value);
  }
  return String(value);
}

function ConfigDisplay() {
  if (!configExists()) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text>No config file found.</Text>
        <Text>
          Run: <Text bold>crosspost init</Text> to set up
        </Text>
      </Box>
    );
  }

  const config = loadConfig();

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>CrossPost Config</Text>
        <Text dimColor> ({getConfigFile()})</Text>
      </Box>
      {PLATFORM_NAMES.map((platform) => {
        const platConfig = config.platforms[platform as keyof typeof config.platforms];
        const enabled = platConfig && "enabled" in platConfig && platConfig.enabled;

        return (
          <Box key={platform} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={enabled ? "green" : "gray"}>
                {enabled ? "✓" : "○"} {platform}
              </Text>
            </Box>
            {enabled && (
              <Box flexDirection="column" marginLeft={4}>
                {Object.entries(platConfig as Record<string, unknown>)
                  .filter(([k, v]) => k !== "enabled" && v !== undefined && v !== null)
                  .map(([k, v]) => {
                    if (Array.isArray(v)) {
                      return (
                        <Text key={k} dimColor>
                          {k}: [{v.length} items]
                        </Text>
                      );
                    }
                    return (
                      <Text key={k} dimColor>
                        {k}: {maskValue(k, v)}
                      </Text>
                    );
                  })}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

export async function runConfigCommand(action?: string, key?: string, value?: string): Promise<void> {
  if (action === "reset") {
    resetConfig();
    console.log("Config reset to defaults.");
    return;
  }

  if (action === "set" && key && value) {
    const config = loadConfig();
    const parts = key.split(".");
    let obj: Record<string, unknown> = config as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof obj[parts[i]] !== "object") obj[parts[i]] = {};
      obj = obj[parts[i]] as Record<string, unknown>;
    }
    obj[parts[parts.length - 1]] = value;
    saveConfig(config);
    console.log(`Set ${key} = ${value}`);
    return;
  }

  if (action === "get" && key) {
    const config = loadConfig();
    const parts = key.split(".");
    let obj: unknown = config;
    for (const part of parts) {
      if (typeof obj === "object" && obj !== null) {
        obj = (obj as Record<string, unknown>)[part];
      } else {
        obj = undefined;
        break;
      }
    }
    console.log(obj !== undefined ? JSON.stringify(obj, null, 2) : `Key "${key}" not found`);
    return;
  }

  // Default: show config
  const { waitUntilExit } = render(<ConfigDisplay />);
  await waitUntilExit();
}
