import React, { useState, useEffect } from "react";
import { Box, Text, render } from "ink";
import { loadConfig, configExists } from "../config/store.js";
import { createAdapters, validateAll } from "../core/engine.js";
import { PlatformStatusLine } from "../ui/PlatformStatus.js";
import { PLATFORM_NAMES, type PlatformName } from "../config/schema.js";
import type { StatusState } from "../ui/PlatformStatus.js";

interface PlatformInfo {
  key: string;
  name: string;
  status: StatusState;
  detail?: string;
}

const PLATFORM_DISPLAY: Record<string, string> = {
  telegram: "Telegram",
  x: "X/Twitter",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  medium: "Medium",
  discord: "Discord",
  blog: "Blog",
};

function StatusUI() {
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function check() {
      if (!configExists()) {
        setPlatforms(
          PLATFORM_NAMES.map((p) => ({
            key: p,
            name: PLATFORM_DISPLAY[p] ?? p,
            status: "skipped" as StatusState,
            detail: "not configured",
          })),
        );
        setDone(true);
        return;
      }

      const config = loadConfig();

      // Initialize all platforms
      const initial: PlatformInfo[] = PLATFORM_NAMES.map((p) => {
        const platConfig = config.platforms[p as keyof typeof config.platforms];
        const enabled = platConfig && "enabled" in platConfig && platConfig.enabled;
        return {
          key: p,
          name: PLATFORM_DISPLAY[p] ?? p,
          status: enabled ? ("validating" as StatusState) : ("skipped" as StatusState),
          detail: enabled ? "checking..." : "not configured",
        };
      });
      setPlatforms(initial);

      // Validate enabled platforms
      const adapters = createAdapters(config);
      await validateAll(adapters, (name, valid) => {
        setPlatforms((prev) =>
          prev.map((p) => {
            if (p.name === name) {
              // Build detail string
              let detail = valid ? "connected" : "authentication failed";
              if (valid && p.key === "telegram") {
                const channels = config.platforms.telegram.channels;
                if (channels.length > 0) {
                  detail = `${channels.length} channel${channels.length > 1 ? "s" : ""} (${channels.map((c) => c.id).join(", ")})`;
                }
              }
              if (valid && p.key === "bluesky") {
                detail = config.platforms.bluesky.handle ?? "connected";
              }
              if (valid && p.key === "discord") {
                const hooks = config.platforms.discord.webhooks;
                detail = `${hooks.length} webhook${hooks.length > 1 ? "s" : ""}`;
              }
              return { ...p, status: valid ? "success" : "error", detail };
            }
            return p;
          }),
        );
      });

      setDone(true);
    }
    check();
  }, []);

  const active = platforms.filter((p) => p.status === "success").length;
  const errors = platforms.filter((p) => p.status === "error").length;
  const notConfigured = platforms.filter((p) => p.status === "skipped").length;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>CrossPost v0.1.0</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>Connected platforms:</Text>
      </Box>
      {platforms.map((p) => (
        <PlatformStatusLine key={p.key} name={p.name} status={p.status} detail={p.detail} />
      ))}
      {done && (
        <Box marginTop={1}>
          <Text dimColor>
            {active} active{errors > 0 ? `, ${errors} error${errors > 1 ? "s" : ""}` : ""}
            {notConfigured > 0 ? `, ${notConfigured} not configured` : ""}
          </Text>
        </Box>
      )}
      {done && active === 0 && (
        <Box marginTop={1}>
          <Text>
            Run: <Text bold>crosspost init</Text> to connect platforms
          </Text>
        </Box>
      )}
    </Box>
  );
}

export async function runStatusCommand(): Promise<void> {
  const { waitUntilExit } = render(<StatusUI />);
  await waitUntilExit();
}
