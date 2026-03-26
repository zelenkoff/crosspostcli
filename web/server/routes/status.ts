import { loadConfig, configExists } from "../../../src/config/store.js";
import { createAdapters, validateAll } from "../../../src/core/engine.js";
import { PLATFORM_NAMES } from "../../../src/config/schema.js";
import type { PlatformStatusDTO, StatusResponse } from "../../shared/api-types.js";

const PLATFORM_DISPLAY: Record<string, string> = {
  telegram: "Telegram",
  x: "X/Twitter",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  medium: "Medium",
  discord: "Discord",
  blog: "Blog",
};

export async function handleStatus(): Promise<Response> {
  if (!configExists()) {
    const platforms: PlatformStatusDTO[] = PLATFORM_NAMES.map((p) => ({
      key: p,
      name: PLATFORM_DISPLAY[p] ?? p,
      status: "skipped",
      detail: "not configured",
    }));
    const body: StatusResponse = { platforms };
    return Response.json(body);
  }

  const config = loadConfig();
  const adapters = createAdapters(config);

  const adapterKeys = new Set(adapters.keys());
  const configuredBasePlatforms = new Set([...adapterKeys].map((k) => k.split(":")[0]));

  const platforms: PlatformStatusDTO[] = [];

  // Adapter rows (validating state initially)
  for (const [key, adapter] of adapters) {
    const baseName = PLATFORM_DISPLAY[key.split(":")[0]] ?? key;
    const lang = adapter.language;
    const displayName = lang ? `${baseName} [${lang}]` : baseName;
    platforms.push({ key, name: displayName, status: "validating", detail: "checking..." });
  }

  // Not-configured rows
  for (const p of PLATFORM_NAMES) {
    if (!configuredBasePlatforms.has(p)) {
      platforms.push({ key: p, name: PLATFORM_DISPLAY[p] ?? p, status: "skipped", detail: "not configured" });
    }
  }

  // Run validation
  const results = await validateAll(adapters);

  const resolved = platforms.map((p) => {
    const adapter = adapters.get(p.key);
    if (!adapter) return p;
    const valid = results.get(p.key) ?? false;
    const baseKey = p.key.split(":")[0];

    let detail = valid ? "connected" : "authentication failed";

    if (valid && baseKey === "telegram") {
      const ch = (adapter as any).config?.channels as Array<{ id: string; language?: string }> | undefined;
      if (ch && ch.length > 0) detail = ch.map((c) => c.id).join(", ");
    }
    if (valid && baseKey === "bluesky") {
      const bluesky = config.platforms.bluesky;
      const lang = bluesky.language;
      detail = (bluesky.handle ?? "connected") + (lang ? ` [${lang}]` : "");
    }
    if (valid && baseKey === "discord") {
      const hooks = (adapter as any).config?.webhooks as Array<{ url: string; label?: string }> | undefined;
      if (hooks) detail = hooks.map((h) => h.label ?? h.url.slice(0, 30) + "…").join(", ");
    }
    if (valid && baseKey === "x") {
      const lang = config.platforms.x.language;
      detail = "connected" + (lang ? ` [${lang}]` : "");
    }
    if (valid && baseKey === "mastodon") {
      const lang = config.platforms.mastodon.language;
      detail = (config.platforms.mastodon.instance_url ?? "connected") + (lang ? ` [${lang}]` : "");
    }
    if (valid && baseKey === "medium") {
      const lang = config.platforms.medium.language;
      detail = `${config.platforms.medium.publish_status} draft` + (lang ? ` [${lang}]` : "");
    }
    if (valid && baseKey === "blog") {
      const lang = config.platforms.blog.language;
      const dir = config.platforms.blog.content_dir ?? "not set";
      detail = dir + (lang ? ` [${lang}]` : "");
    }

    return { ...p, status: (valid ? "success" : "error") as PlatformStatusDTO["status"], detail };
  });

  const body: StatusResponse = { platforms: resolved };
  return Response.json(body);
}
