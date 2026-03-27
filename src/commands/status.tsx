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
      const adapters = createAdapters(config);

      // Build initial list: one row per adapter key, plus unconfigured platforms
      const adapterKeys = new Set(adapters.keys());
      const configuredBasePlatforms = new Set(
        [...adapterKeys].map((k) => k.split(":")[0])
      );

      const initial: PlatformInfo[] = [];
      // Add adapter rows
      for (const [key, adapter] of adapters) {
        const baseName = PLATFORM_DISPLAY[key.split(":")[0]] ?? key;
        const lang = adapter.language;
        const displayName = lang ? `${baseName} [${lang}]` : baseName;
        initial.push({ key, name: displayName, status: "validating", detail: "checking..." });
      }
      // Add not-configured platforms
      for (const p of PLATFORM_NAMES) {
        if (!configuredBasePlatforms.has(p)) {
          initial.push({ key: p, name: PLATFORM_DISPLAY[p] ?? p, status: "skipped", detail: "not configured" });
        }
      }
      setPlatforms(initial);

      const results = await validateAll(adapters);
      setPlatforms((prev) =>
        prev.map((p) => {
          const adapter = adapters.get(p.key);
          if (!adapter) return p;
          const valid = results.get(p.key) ?? false;

          let detail = valid ? "connected" : "authentication failed";
          const baseKey = p.key.split(":")[0];

          if (valid && baseKey === "telegram") {
            const tAdapter = adapter as import("../adapters/telegram.js").TelegramAdapter;
            const ch = (tAdapter as any).config?.channels as Array<{ id: string; language?: string }> | undefined;
            if (ch && ch.length > 0) detail = ch.map((c) => c.id).join(", ");
          }
          if (valid && baseKey === "bluesky") {
            const lang = config.platforms.bluesky.language;
            detail = (config.platforms.bluesky.handle ?? "connected") + (lang ? ` [${lang}]` : "");
          }
          if (valid && baseKey === "x") {
            const lang = config.platforms.x.language;
            detail = "connected" + (lang ? ` [${lang}]` : "");
          }
          if (valid && baseKey === "mastodon") {
            const lang = config.platforms.mastodon.language;
            detail = (config.platforms.mastodon.instance_url ?? "connected") + (lang ? ` [${lang}]` : "");
          }
          if (valid && baseKey === "blog") {
            const lang = config.platforms.blog.language;
            const dir = config.platforms.blog.content_dir ?? "not set";
            detail = dir + (lang ? ` [${lang}]` : "");
          }
          return { ...p, status: valid ? "success" : "error", detail };
        }),
      );

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
