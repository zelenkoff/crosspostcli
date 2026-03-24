import { describe, test, expect } from "bun:test";
import { ConfigSchema, PLATFORM_NAMES } from "../../src/config/schema.js";

describe("ConfigSchema", () => {
  test("creates valid default config", () => {
    const config = ConfigSchema.parse({});
    expect(config.version).toBe(1);
    expect(config.platforms.telegram.enabled).toBe(false);
    expect(config.platforms.x.enabled).toBe(false);
    expect(config.platforms.bluesky.enabled).toBe(false);
    expect(config.defaults.dry_run).toBe(false);
    expect(config.screenshot.viewport.width).toBe(1280);
  });

  test("validates full config", () => {
    const config = ConfigSchema.parse({
      version: 1,
      platforms: {
        telegram: {
          enabled: true,
          bot_token: "123:ABC",
          channels: [{ id: "@test", label: "Test" }],
        },
        x: {
          enabled: true,
          api_key: "key",
          api_secret: "secret",
          access_token: "token",
          access_secret: "secret",
        },
        bluesky: {
          enabled: true,
          handle: "user.bsky.social",
          app_password: "pass",
        },
      },
    });

    expect(config.platforms.telegram.enabled).toBe(true);
    expect(config.platforms.telegram.channels).toHaveLength(1);
    expect(config.platforms.x.enabled).toBe(true);
    expect(config.platforms.bluesky.handle).toBe("user.bsky.social");
  });

  test("PLATFORM_NAMES contains all platforms", () => {
    expect(PLATFORM_NAMES).toContain("telegram");
    expect(PLATFORM_NAMES).toContain("x");
    expect(PLATFORM_NAMES).toContain("bluesky");
    expect(PLATFORM_NAMES).toContain("mastodon");
    expect(PLATFORM_NAMES).toContain("medium");
    expect(PLATFORM_NAMES).toContain("discord");
    expect(PLATFORM_NAMES).toContain("blog");
    expect(PLATFORM_NAMES).toHaveLength(7);
  });
});
