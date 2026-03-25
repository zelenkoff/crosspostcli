import { describe, test, expect } from "bun:test";
import { TelegramAdapter } from "../../src/adapters/telegram.js";
import { XTwitterAdapter } from "../../src/adapters/x-twitter.js";
import { BlueskyAdapter } from "../../src/adapters/bluesky.js";
import { MastodonAdapter } from "../../src/adapters/mastodon.js";
import { DiscordAdapter } from "../../src/adapters/discord.js";
import { MediumAdapter } from "../../src/adapters/medium.js";

describe("TelegramAdapter", () => {
  const adapter = new TelegramAdapter({
    enabled: true,
    bot_token: "fake-token",
    channels: [{ id: "@test" }],
  });

  test("has correct name", () => {
    expect(adapter.name).toBe("Telegram");
  });

  test("max text length is 4096", () => {
    expect(adapter.maxTextLength).toBe(4096);
  });

  test("supports images", () => {
    expect(adapter.supportsImages).toBe(true);
  });

  test("supports HTML", () => {
    expect(adapter.supportsHtml).toBe(true);
  });

  test("formatText truncates long text", () => {
    const longText = "a".repeat(5000);
    expect(adapter.formatText(longText)).toHaveLength(4096);
  });

  test("validate returns false without token", async () => {
    const noToken = new TelegramAdapter({ enabled: true, channels: [] });
    expect(await noToken.validate()).toBe(false);
  });

  test("post returns error when no channels configured", async () => {
    const noChannels = new TelegramAdapter({ enabled: true, bot_token: "fake", channels: [] });
    const results = await noChannels.post({ text: "test" });
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("No channels");
  });
});

describe("XTwitterAdapter", () => {
  const adapter = new XTwitterAdapter({
    enabled: true,
    api_key: "key",
    api_secret: "secret",
    access_token: "token",
    access_secret: "secret",
  });

  test("has correct name", () => {
    expect(adapter.name).toBe("X/Twitter");
  });

  test("max text length is 280", () => {
    expect(adapter.maxTextLength).toBe(280);
  });

  test("formatText truncates with ellipsis", () => {
    const longText = "a".repeat(300);
    const formatted = adapter.formatText(longText);
    expect(formatted.length).toBe(280);
    expect(formatted.endsWith("…")).toBe(true);
  });

  test("formatText preserves short text", () => {
    expect(adapter.formatText("Hello!")).toBe("Hello!");
  });

  test("validate returns false without credentials", async () => {
    const noAuth = new XTwitterAdapter({ enabled: true });
    expect(await noAuth.validate()).toBe(false);
  });
});

describe("BlueskyAdapter", () => {
  const adapter = new BlueskyAdapter({
    enabled: true,
    handle: "user.bsky.social",
    app_password: "pass",
  });

  test("has correct name", () => {
    expect(adapter.name).toBe("Bluesky");
  });

  test("max text length is 300", () => {
    expect(adapter.maxTextLength).toBe(300);
  });

  test("formatText handles graphemes correctly", () => {
    // Emoji is 1 grapheme
    const emoji = "👋".repeat(301);
    const formatted = adapter.formatText(emoji);
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const graphemeCount = [...segmenter.segment(formatted)].length;
    expect(graphemeCount).toBe(300);
  });

  test("validate returns false without credentials", async () => {
    const noAuth = new BlueskyAdapter({ enabled: true });
    expect(await noAuth.validate()).toBe(false);
  });
});

describe("MastodonAdapter", () => {
  const adapter = new MastodonAdapter({
    enabled: true,
    instance_url: "https://mastodon.social",
    access_token: "token",
  });

  test("has correct name", () => {
    expect(adapter.name).toBe("Mastodon");
  });

  test("max text length is 500", () => {
    expect(adapter.maxTextLength).toBe(500);
  });

  test("validate returns false without credentials", async () => {
    const noAuth = new MastodonAdapter({ enabled: true });
    expect(await noAuth.validate()).toBe(false);
  });
});

describe("DiscordAdapter", () => {
  test("returns error when no webhooks configured", async () => {
    const adapter = new DiscordAdapter({ enabled: true, webhooks: [] });
    const results = await adapter.post({ text: "test" });
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("No webhooks");
  });
});

describe("MediumAdapter", () => {
  test("validate returns false without token", async () => {
    const adapter = new MediumAdapter({ enabled: true, publish_status: "draft" });
    expect(await adapter.validate()).toBe(false);
  });
});
