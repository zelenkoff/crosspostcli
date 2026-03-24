import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig, configExists } from "../config/store.js";
import { createAdapters, filterAdapters, postToAll, validateAll, type PostOptions } from "../core/engine.js";
import { PLATFORM_NAMES } from "../config/schema.js";
import { captureScreenshot, formatSize, listDevices, type ScreenshotOptions } from "../screenshot/capture.js";
import { checkSetup } from "../screenshot/setup.js";
import { readFileSync } from "fs";

const VERSION = "0.1.0";

export function createMcpServer() {
  const server = new McpServer({
    name: "crosspost",
    version: VERSION,
  });

  // ── Tool: post ──────────────────────────────────────────────────────

  server.tool(
    "post",
    "Post content to social platforms. Posts text (and optional images) to all configured platforms concurrently.",
    {
      text: z.string().describe("The text content to post"),
      platforms: z.string().optional().describe("Comma-separated platform names to post to (default: all configured)"),
      exclude: z.string().optional().describe("Comma-separated platform names to skip"),
      image_paths: z.array(z.string()).optional().describe("File paths to images to attach"),
      url: z.string().optional().describe("URL to append to posts"),
      dry_run: z.boolean().optional().describe("Preview without actually posting"),
      telegram_text: z.string().optional().describe("Custom text override for Telegram"),
      x_text: z.string().optional().describe("Custom text override for X/Twitter"),
      bluesky_text: z.string().optional().describe("Custom text override for Bluesky"),
      mastodon_text: z.string().optional().describe("Custom text override for Mastodon"),
      discord_text: z.string().optional().describe("Custom text override for Discord"),
      medium_text: z.string().optional().describe("Custom text override for Medium"),
    },
    async (params) => {
      if (!configExists()) {
        return {
          content: [{ type: "text", text: "CrossPost is not configured. Run `crosspost init` to set up platforms." }],
          isError: true,
        };
      }

      const config = loadConfig();
      const postOptions: PostOptions = {
        only: params.platforms?.split(",").map((s) => s.trim()),
        exclude: params.exclude?.split(",").map((s) => s.trim()),
        dryRun: params.dry_run,
        perPlatformText: {},
      };

      if (params.telegram_text) postOptions.perPlatformText!.telegram = params.telegram_text;
      if (params.x_text) postOptions.perPlatformText!.x = params.x_text;
      if (params.bluesky_text) postOptions.perPlatformText!.bluesky = params.bluesky_text;
      if (params.mastodon_text) postOptions.perPlatformText!.mastodon = params.mastodon_text;
      if (params.discord_text) postOptions.perPlatformText!.discord = params.discord_text;
      if (params.medium_text) postOptions.perPlatformText!.medium = params.medium_text;

      const allAdapters = createAdapters(config, postOptions);
      const adapters = filterAdapters(allAdapters, postOptions);

      if (adapters.size === 0) {
        return {
          content: [{ type: "text", text: "No platforms configured or all filtered out. Run `crosspost init` to connect platforms." }],
          isError: true,
        };
      }

      // Load images
      const images: Buffer[] = [];
      if (params.image_paths) {
        for (const imgPath of params.image_paths) {
          try {
            images.push(readFileSync(imgPath));
          } catch (err) {
            return {
              content: [{ type: "text", text: `Failed to read image: ${imgPath}\n${err instanceof Error ? err.message : String(err)}` }],
              isError: true,
            };
          }
        }
      }

      // Dry run
      if (params.dry_run) {
        const preview = Array.from(adapters.entries()).map(([key, adapter]) => ({
          platform: key,
          text: adapter.formatText(params.text),
          charCount: adapter.formatText(params.text).length,
          maxLength: adapter.maxTextLength,
          hasImages: images.length > 0,
        }));
        return {
          content: [{ type: "text", text: JSON.stringify({ dryRun: true, platforms: preview }, null, 2) }],
        };
      }

      // Post
      const content = {
        text: params.text,
        images: images.length > 0 ? images : undefined,
        url: params.url,
      };

      const results = await postToAll(adapters, content, postOptions);

      const summary = results.map((r) => ({
        platform: r.platform,
        success: r.success,
        url: r.url,
        channel: r.channel,
        error: r.error,
        durationMs: r.durationMs,
      }));

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return {
        content: [{
          type: "text",
          text: `Posted to ${succeeded} platform(s)${failed > 0 ? `, ${failed} failed` : ""}.\n\n${JSON.stringify(summary, null, 2)}`,
        }],
        isError: failed > 0 && succeeded === 0,
      };
    },
  );

  // ── Tool: status ────────────────────────────────────────────────────

  server.tool(
    "status",
    "Show connected platforms and their configuration status. Returns which platforms are enabled and configured.",
    {},
    async () => {
      if (!configExists()) {
        return {
          content: [{ type: "text", text: "CrossPost is not configured. Run `crosspost init` to set up platforms." }],
          isError: true,
        };
      }

      const config = loadConfig();
      const postOptions: PostOptions = {};
      const adapters = createAdapters(config, postOptions);

      const platforms = Array.from(adapters.entries()).map(([key, adapter]) => ({
        name: key,
        displayName: adapter.name,
        supportsImages: adapter.supportsImages,
        maxTextLength: adapter.maxTextLength,
      }));

      const allPlatforms = PLATFORM_NAMES.map((name) => {
        const connected = platforms.find((p) => p.name === name);
        return {
          name,
          connected: !!connected,
          ...(connected ?? {}),
        };
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ platforms: allPlatforms }, null, 2),
        }],
      };
    },
  );

  // ── Tool: validate ──────────────────────────────────────────────────

  server.tool(
    "validate",
    "Validate credentials for all connected platforms. Tests API access and returns pass/fail for each.",
    {
      platforms: z.string().optional().describe("Comma-separated platform names to validate (default: all)"),
    },
    async (params) => {
      if (!configExists()) {
        return {
          content: [{ type: "text", text: "CrossPost is not configured. Run `crosspost init` to set up platforms." }],
          isError: true,
        };
      }

      const config = loadConfig();
      const postOptions: PostOptions = {
        only: params.platforms?.split(",").map((s) => s.trim()),
      };
      const allAdapters = createAdapters(config, postOptions);
      const adapters = filterAdapters(allAdapters, postOptions);

      if (adapters.size === 0) {
        return {
          content: [{ type: "text", text: "No platforms to validate." }],
          isError: true,
        };
      }

      const results = await validateAll(adapters);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ validation: results }, null, 2),
        }],
      };
    },
  );

  // ── Tool: screenshot ────────────────────────────────────────────────

  server.tool(
    "screenshot",
    "Take a screenshot of a web page. Requires Playwright to be installed (run `crosspost screenshot --setup` first).",
    {
      url: z.string().describe("URL to screenshot"),
      selector: z.string().optional().describe("CSS selector to capture a specific element"),
      highlight: z.array(z.string()).optional().describe("CSS selectors to highlight with red outline"),
      hide: z.array(z.string()).optional().describe("CSS selectors to hide (e.g., cookie banners)"),
      device: z.string().optional().describe("Device emulation preset (e.g., iphone-14, macbook-pro)"),
      width: z.number().optional().describe("Viewport width in pixels"),
      height: z.number().optional().describe("Viewport height in pixels"),
      delay: z.number().optional().describe("Delay in ms before capture (default: 2000)"),
      full_page: z.boolean().optional().describe("Capture full scrollable page"),
      dark_mode: z.boolean().optional().describe("Use dark color scheme"),
      format: z.enum(["png", "jpeg"]).optional().describe("Output format (default: png)"),
      quality: z.number().optional().describe("JPEG quality 1-100"),
      output: z.string().optional().describe("Save path for screenshot file"),
    },
    async (params) => {
      const setup = checkSetup();
      if (!setup.installed) {
        return {
          content: [{ type: "text", text: "Playwright is not installed. Run `crosspost screenshot --setup` to install it." }],
          isError: true,
        };
      }

      const options: ScreenshotOptions = {
        url: params.url,
        selector: params.selector,
        highlight: params.highlight,
        hide: params.hide,
        device: params.device,
        viewport: params.width && params.height ? { width: params.width, height: params.height } : undefined,
        delay: params.delay,
        fullPage: params.full_page,
        darkMode: params.dark_mode,
        format: params.format,
        quality: params.quality,
        output: params.output,
      };

      try {
        const result = await captureScreenshot(options);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              path: result.path,
              width: result.width,
              height: result.height,
              size: formatSize(result.size),
              format: result.format,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Screenshot failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  // ── Tool: post_with_screenshot ──────────────────────────────────────

  server.tool(
    "post_with_screenshot",
    "Take a screenshot of a URL and post it with text to all platforms in one step.",
    {
      text: z.string().describe("The text content to post"),
      screenshot_url: z.string().describe("URL to screenshot and attach"),
      screenshot_selector: z.string().optional().describe("CSS selector to capture"),
      screenshot_hide: z.array(z.string()).optional().describe("CSS selectors to hide"),
      screenshot_device: z.string().optional().describe("Device preset for screenshot"),
      screenshot_dark_mode: z.boolean().optional().describe("Dark mode for screenshot"),
      platforms: z.string().optional().describe("Comma-separated platform names (default: all)"),
      exclude: z.string().optional().describe("Comma-separated platforms to skip"),
      url: z.string().optional().describe("URL to append to post text"),
      dry_run: z.boolean().optional().describe("Preview without posting"),
    },
    async (params) => {
      // Check Playwright
      const setup = checkSetup();
      if (!setup.installed) {
        return {
          content: [{ type: "text", text: "Playwright is not installed. Run `crosspost screenshot --setup` to install it." }],
          isError: true,
        };
      }

      if (!configExists()) {
        return {
          content: [{ type: "text", text: "CrossPost is not configured. Run `crosspost init` to set up platforms." }],
          isError: true,
        };
      }

      // Take screenshot
      let screenshotBuffer: Buffer;
      try {
        const result = await captureScreenshot({
          url: params.screenshot_url,
          selector: params.screenshot_selector,
          hide: params.screenshot_hide,
          device: params.screenshot_device,
          darkMode: params.screenshot_dark_mode,
        });
        screenshotBuffer = result.buffer;
      } catch (err) {
        return {
          content: [{ type: "text", text: `Screenshot failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }

      // Post
      const config = loadConfig();
      const postOptions: PostOptions = {
        only: params.platforms?.split(",").map((s) => s.trim()),
        exclude: params.exclude?.split(",").map((s) => s.trim()),
        dryRun: params.dry_run,
      };

      const allAdapters = createAdapters(config, postOptions);
      const adapters = filterAdapters(allAdapters, postOptions);

      if (adapters.size === 0) {
        return {
          content: [{ type: "text", text: "No platforms configured." }],
          isError: true,
        };
      }

      if (params.dry_run) {
        const preview = Array.from(adapters.entries()).map(([key, adapter]) => ({
          platform: key,
          text: adapter.formatText(params.text),
          charCount: adapter.formatText(params.text).length,
          hasScreenshot: true,
        }));
        return {
          content: [{ type: "text", text: JSON.stringify({ dryRun: true, screenshotCaptured: true, platforms: preview }, null, 2) }],
        };
      }

      const results = await postToAll(
        adapters,
        { text: params.text, images: [screenshotBuffer], url: params.url },
        postOptions,
      );

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      const summary = results.map((r) => ({
        platform: r.platform,
        success: r.success,
        url: r.url,
        error: r.error,
      }));

      return {
        content: [{
          type: "text",
          text: `Screenshot taken and posted to ${succeeded} platform(s)${failed > 0 ? `, ${failed} failed` : ""}.\n\n${JSON.stringify(summary, null, 2)}`,
        }],
      };
    },
  );

  // ── Tool: list_devices ──────────────────────────────────────────────

  server.tool(
    "list_devices",
    "List available device presets for screenshot emulation.",
    {},
    async () => {
      const devices = listDevices();
      return {
        content: [{
          type: "text",
          text: `Available device presets:\n${devices.map((d) => `  - ${d}`).join("\n")}\n\nPlaywright device names are also supported.`,
        }],
      };
    },
  );

  return server;
}

// ── Entrypoint ──────────────────────────────────────────────────────────

export async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
