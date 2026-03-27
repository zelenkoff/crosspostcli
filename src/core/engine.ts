import type { Adapter, PostContent, PostResult, ThreadPost } from "../adapters/types.js";
import type { Config, PlatformName } from "../config/schema.js";
import { TelegramAdapter } from "../adapters/telegram.js";
import { XTwitterAdapter } from "../adapters/x-twitter.js";
import { BlueskyAdapter } from "../adapters/bluesky.js";
import { MastodonAdapter } from "../adapters/mastodon.js";
import { MediumAdapter } from "../adapters/medium.js";
import { DevToAdapter } from "../adapters/devto.js";
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
  perPlatformImages?: Record<string, Buffer[]>;
  /** Thread posts per platform (e.g. Bluesky thread segments) */
  perPlatformThread?: Record<string, ThreadPost[]>;
}

export type PostingEvent =
  | { type: "start"; platform: string; channel?: string }
  | { type: "done"; result: PostResult }
  | { type: "complete"; results: PostResult[] };

export function createAdapters(config: Config, options?: PostOptions): Map<string, Adapter> {
  const adapters = new Map<string, Adapter>();
  const p = config.platforms;

  if (p.telegram.enabled && p.telegram.bot_token) {
    const languages = [...new Set(p.telegram.channels.map((c) => c.language ?? "").filter(Boolean))];
    const hasNoLang = p.telegram.channels.some((c) => !c.language);

    if (languages.length > 1 || (languages.length === 1 && hasNoLang)) {
      // Mixed languages — create one adapter per language group so AI generates separate texts
      for (const lang of languages) {
        const langChannels = p.telegram.channels.filter((c) => c.language === lang);
        adapters.set(`telegram:${lang}`, new TelegramAdapter({ ...p.telegram, channels: langChannels }));
      }
      if (hasNoLang) {
        const noLangChannels = p.telegram.channels.filter((c) => !c.language);
        adapters.set("telegram", new TelegramAdapter({ ...p.telegram, channels: noLangChannels }));
      }
    } else {
      adapters.set("telegram", new TelegramAdapter(p.telegram));
    }
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
  if (p.devto.enabled && p.devto.api_key) {
    adapters.set("devto", new DevToAdapter(p.devto));
  }
  if (p.discord.enabled && p.discord.webhooks.length > 0) {
    const languages = [...new Set(p.discord.webhooks.map((w) => w.language ?? "").filter(Boolean))];
    const hasNoLang = p.discord.webhooks.some((w) => !w.language);

    if (languages.length > 1 || (languages.length === 1 && hasNoLang)) {
      for (const lang of languages) {
        const langWebhooks = p.discord.webhooks.filter((w) => w.language === lang);
        adapters.set(`discord:${lang}`, new DiscordAdapter({ ...p.discord, webhooks: langWebhooks }));
      }
      if (hasNoLang) {
        const noLangWebhooks = p.discord.webhooks.filter((w) => !w.language);
        adapters.set("discord", new DiscordAdapter({ ...p.discord, webhooks: noLangWebhooks }));
      }
    } else {
      adapters.set("discord", new DiscordAdapter(p.discord));
    }
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

  // Keys can be "telegram", "telegram:ru", "discord:en" etc.
  // Match by exact key OR by base platform name (part before ":").
  const matchesAny = (key: string, names: Set<string>): boolean => {
    if (names.has(key)) return true;
    const base = key.split(":")[0];
    return names.has(base);
  };

  if (options.only && options.only.length > 0) {
    const allowed = new Set(options.only.map((p) => p.toLowerCase()));
    for (const key of filtered.keys()) {
      if (!matchesAny(key, allowed)) filtered.delete(key);
    }
  }

  if (options.exclude && options.exclude.length > 0) {
    const excluded = new Set(options.exclude.map((p) => p.toLowerCase()));
    for (const key of filtered.keys()) {
      if (matchesAny(key, excluded)) filtered.delete(key);
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

    // Use per-platform images if available (agent loop assigns different screenshots per platform)
    if (options.perPlatformImages?.[key]) {
      platformContent.images = options.perPlatformImages[key];
    }

    // Use per-platform thread if available (Bluesky thread mode)
    if (options.perPlatformThread?.[key]) {
      platformContent.thread = options.perPlatformThread[key];
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
      onEvent?.(key, valid);
    } catch {
      results.set(key, false);
      onEvent?.(key, false);
    }
  });

  await Promise.allSettled(promises);
  return results;
}
