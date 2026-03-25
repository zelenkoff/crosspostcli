import { describe, test, expect } from "bun:test";
import { createAdapters, filterAdapters } from "../../src/core/engine.js";
import { ConfigSchema } from "../../src/config/schema.js";

describe("createAdapters", () => {
  test("creates no adapters for empty config", () => {
    const config = ConfigSchema.parse({});
    const adapters = createAdapters(config);
    expect(adapters.size).toBe(0);
  });

  test("creates adapters for enabled platforms", () => {
    const config = ConfigSchema.parse({
      platforms: {
        telegram: {
          enabled: true,
          bot_token: "fake-token",
          channels: [{ id: "@test" }],
        },
        bluesky: {
          enabled: true,
          handle: "user.bsky.social",
          app_password: "pass",
        },
      },
    });
    const adapters = createAdapters(config);
    expect(adapters.has("telegram")).toBe(true);
    expect(adapters.has("bluesky")).toBe(true);
    expect(adapters.has("x")).toBe(false);
  });

  test("skips disabled platforms", () => {
    const config = ConfigSchema.parse({
      platforms: {
        telegram: {
          enabled: false,
          bot_token: "fake-token",
          channels: [{ id: "@test" }],
        },
      },
    });
    const adapters = createAdapters(config);
    expect(adapters.has("telegram")).toBe(false);
  });
});

describe("filterAdapters", () => {
  test("filters by --only", () => {
    const config = ConfigSchema.parse({
      platforms: {
        telegram: { enabled: true, bot_token: "t", channels: [{ id: "@t" }] },
        bluesky: { enabled: true, handle: "h", app_password: "p" },
      },
    });
    const adapters = createAdapters(config);
    const filtered = filterAdapters(adapters, { only: ["telegram"] });
    expect(filtered.size).toBe(1);
    expect(filtered.has("telegram")).toBe(true);
  });

  test("filters by --exclude", () => {
    const config = ConfigSchema.parse({
      platforms: {
        telegram: { enabled: true, bot_token: "t", channels: [{ id: "@t" }] },
        bluesky: { enabled: true, handle: "h", app_password: "p" },
      },
    });
    const adapters = createAdapters(config);
    const filtered = filterAdapters(adapters, { exclude: ["telegram"] });
    expect(filtered.size).toBe(1);
    expect(filtered.has("bluesky")).toBe(true);
  });
});
