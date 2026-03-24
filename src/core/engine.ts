import type { Adapter, PostContent, PostResult } from "../adapters/types.js";
import type { Config, PlatformName } from "../config/schema.js";
import { TelegramAdapter } from "../adapters/telegram.js";
import { XTwitterAdapter } from "../adapters/x-twitter.js";
import { BlueskyAdapter } from "../adapters/bluesky.js";
import { MastodonAdapter } from "../adapters/mastodon.js";
import { MediumAdapter } from "../adapters/medium.js";
import { DiscordAdapter } from "../adapters/discord.js";
import { BlogGitAdapter } from "../adapters/blog-git.js";
import { optimizeForPlatform } from "../utils/image.js";

export interface PostOptions {
  only?: string[];
  exclude?: string[];
  dryRun?: boolean;
  verbose?: boolean;
  blogSlug?: string;
  blogTitle?: string;
  blogTags?: string[];
  perPlatformText?: Record<string, string>;
}

export type PostingEvent =
  | { type: "start"; platform: string; channel?: string }
  | { type: "done"; result: PostResult }
  | { type: "complete"; results: PostResult[] };

export function createAdapters(config: Config, options?: PostOptions): Map<string, Adapter> {
  const adapters = new Map<string, Adapter>();
  const p = config.platforms;

  if (p.telegram.enabled && p.telegram.bot_token) {
    adapters.set("telegram", new TelegramAdapter(p.telegram));
  }
  if (p.x.enabled && p.x.api_key) {
    adapters.set("x", new XTwitterAdapter(p.x));
  }
  if (p.bluesky.enabled && p.bluesky.handle) {
    adapters.set("bluesky", new BlueskyAdapter(p.bluesky));
  }
  if (p.mastodon.enabled && p.mastodon.access_token) {
    adapters.set("mastodon", new MastodonAdapter(p.mastodon));
  }
  if (p.medium.enabled && p.medium.integration_token) {
    adapters.set("medium", new MediumAdapter(p.medium));
  }
  if (p.discord.enabled && p.discord.webhooks.length > 0) {
    adapters.set("discord", new DiscordAdapter(p.discord));
  }
  if (p.blog.enabled && p.blog.content_dir) {
    adapters.set(
      "blog",
      new BlogGitAdapter(p.blog, {
        slug: options?.blogSlug,
        title: options?.blogTitle,
        tags: options?.blogTags,
      }),
    );
  }

  return adapters;
}

export function filterAdapters(
  adapters: Map<string, Adapter>,
  options: PostOptions,
): Map<string, Adapter> {
  const filtered = new Map(adapters);

  if (options.only && options.only.length > 0) {
    const allowed = new Set(options.only.map((p) => p.toLowerCase()));
    for (const key of filtered.keys()) {
      if (!allowed.has(key)) filtered.delete(key);
    }
  }

  if (options.exclude && options.exclude.length > 0) {
    const excluded = new Set(options.exclude.map((p) => p.toLowerCase()));
    for (const key of filtered.keys()) {
      if (excluded.has(key)) filtered.delete(key);
    }
  }

  return filtered;
}

export async function postToAll(
  adapters: Map<string, Adapter>,
  content: PostContent,
  options: PostOptions,
  onEvent?: (event: PostingEvent) => void,
): Promise<PostResult[]> {
  const allResults: PostResult[] = [];

  const postPromises = Array.from(adapters.entries()).map(async ([key, adapter]) => {
    onEvent?.({ type: "start", platform: adapter.name });

    // Use per-platform text override if available
    const platformContent = { ...content };
    if (options.perPlatformText?.[key]) {
      platformContent.text = options.perPlatformText[key];
    }

    // Optimize images per platform
    if (platformContent.images && platformContent.images.length > 0) {
      platformContent.images = await Promise.all(
        platformContent.images.map((img) => optimizeForPlatform(img, key)),
      );
    }

    const results = await adapter.post(platformContent);
    for (const result of results) {
      onEvent?.({ type: "done", result });
      allResults.push(result);
    }
    return results;
  });

  await Promise.allSettled(postPromises);

  onEvent?.({ type: "complete", results: allResults });
  return allResults;
}

export async function validateAll(
  adapters: Map<string, Adapter>,
  onEvent?: (platform: string, valid: boolean) => void,
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  const promises = Array.from(adapters.entries()).map(async ([key, adapter]) => {
    try {
      const valid = await adapter.validate();
      results.set(key, valid);
      onEvent?.(adapter.name, valid);
    } catch {
      results.set(key, false);
      onEvent?.(adapter.name, false);
    }
  });

  await Promise.allSettled(promises);
  return results;
}
