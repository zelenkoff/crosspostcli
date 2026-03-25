import { z } from "zod";

export const TelegramChannelSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  language: z.string().optional(),
});

export const TelegramConfigSchema = z.object({
  enabled: z.boolean().default(false),
  bot_token: z.string().optional(),
  channels: z.array(TelegramChannelSchema).default([]),
});

export const XConfigSchema = z.object({
  enabled: z.boolean().default(false),
  api_key: z.string().optional(),
  api_secret: z.string().optional(),
  access_token: z.string().optional(),
  access_secret: z.string().optional(),
  language: z.string().optional(),
});

export const BlueskyConfigSchema = z.object({
  enabled: z.boolean().default(false),
  handle: z.string().optional(),
  app_password: z.string().optional(),
  language: z.string().optional(),
});

export const MastodonConfigSchema = z.object({
  enabled: z.boolean().default(false),
  instance_url: z.string().optional(),
  access_token: z.string().optional(),
  language: z.string().optional(),
});

export const MediumConfigSchema = z.object({
  enabled: z.boolean().default(false),
  integration_token: z.string().optional(),
  publish_status: z.enum(["draft", "public"]).default("draft"),
  language: z.string().optional(),
});

export const DiscordWebhookSchema = z.object({
  url: z.string().min(1),
  label: z.string().optional(),
  language: z.string().optional(),
});

export const DiscordConfigSchema = z.object({
  enabled: z.boolean().default(false),
  webhooks: z.array(DiscordWebhookSchema).default([]),
});

export const BlogConfigSchema = z.object({
  enabled: z.boolean().default(false),
  type: z.enum(["mdx", "md"]).default("mdx"),
  content_dir: z.string().optional(),
  git_push: z.boolean().default(false),
  deploy_command: z.string().optional(),
  language: z.string().optional(),
});

export const AiConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(["anthropic", "openai"]).default("anthropic"),
  model: z.string().optional(),
  api_key: z.string().optional(),
  /** Custom system prompt for AI content generation */
  system_prompt: z.string().optional(),
});

export const ScreenshotConfigSchema = z.object({
  viewport: z
    .object({
      width: z.number().default(1280),
      height: z.number().default(800),
    })
    .default({}),
  delay_ms: z.number().default(2000),
  format: z.enum(["png", "jpeg"]).default("png"),
  quality: z.number().min(1).max(100).default(90),
});

export const DefaultsSchema = z.object({
  platforms: z.string().default("all"),
  dry_run: z.boolean().default(false),
  verbose: z.boolean().default(false),
  include_url: z.boolean().default(true),
  url_template: z.string().optional(),
});

export const ConfigSchema = z.object({
  version: z.number().default(1),
  platforms: z
    .object({
      telegram: TelegramConfigSchema.default({}),
      x: XConfigSchema.default({}),
      bluesky: BlueskyConfigSchema.default({}),
      mastodon: MastodonConfigSchema.default({}),
      medium: MediumConfigSchema.default({}),
      discord: DiscordConfigSchema.default({}),
      blog: BlogConfigSchema.default({}),
    })
    .default({}),
  defaults: DefaultsSchema.default({}),
  screenshot: ScreenshotConfigSchema.default({}),
  ai: AiConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;
export type XConfig = z.infer<typeof XConfigSchema>;
export type BlueskyConfig = z.infer<typeof BlueskyConfigSchema>;
export type MastodonConfig = z.infer<typeof MastodonConfigSchema>;
export type MediumConfig = z.infer<typeof MediumConfigSchema>;
export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;
export type BlogConfig = z.infer<typeof BlogConfigSchema>;
export type ScreenshotConfig = z.infer<typeof ScreenshotConfigSchema>;
export type AiConfig = z.infer<typeof AiConfigSchema>;

export const PLATFORM_NAMES = [
  "telegram",
  "x",
  "bluesky",
  "mastodon",
  "medium",
  "discord",
  "blog",
] as const;

export type PlatformName = (typeof PLATFORM_NAMES)[number];
