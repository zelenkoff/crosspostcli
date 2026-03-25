import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig, configExists } from "../config/store.js";
import { createAdapters, filterAdapters, postToAll, validateAll, type PostOptions } from "../core/engine.js";
import { PLATFORM_NAMES } from "../config/schema.js";
import { captureScreenshot, formatSize, listDevices, type ScreenshotOptions } from "../screenshot/capture.js";
import { checkSetup } from "../screenshot/setup.js";
import { readFileSync } from "fs";
import { getCommitRange, getProjectName, getDiffForRange } from "../core/changelog.js";
import { detectTemplate, type Tone, type Verbosity } from "../core/announce-templates.js";
import { buildAiOptions } from "../core/ai-generator.js";
import { runAgentLoop, getScreenshotsForPlatform } from "../core/ai-loop.js";
import type { AuthOptions } from "../screenshot/capture.js";

// Reusable Zod schema for auth options across MCP tools
const AuthParamsSchema = {
  auth_storage_state: z.string().optional().describe("Path to Playwright storage state file (saved browser session with cookies/localStorage)"),
  auth_username: z.string().optional().describe("HTTP Basic Auth username"),
  auth_password: z.string().optional().describe("HTTP Basic Auth password"),
  auth_bearer_token: z.string().optional().describe("Bearer token for Authorization header"),
  auth_headers: z.record(z.string(), z.string()).optional().describe("Custom HTTP headers (e.g., { 'X-API-Key': '...' })"),
  auth_cookies: z.array(z.object({
    name: z.string(),
    value: z.string(),
    domain: z.string(),
    path: z.string().optional(),
    httpOnly: z.boolean().optional(),
    secure: z.boolean().optional(),
  })).optional().describe("Cookies to inject before navigation"),
  auth_login_url: z.string().optional().describe("Login page URL for form-based auth"),
  auth_login_fields: z.record(z.string(), z.string()).optional().describe("CSS selector → value pairs to fill on login form (e.g., { '#email': 'user@example.com', '#password': 's3cret' })"),
  auth_login_submit: z.string().optional().describe("CSS selector for login submit button (default: 'button[type=\"submit\"]')"),
};

/** Build AuthOptions from flat MCP tool params */
function buildAuthOptions(params: Record<string, unknown>): AuthOptions | undefined {
  const auth: AuthOptions = {};
  let hasAuth = false;

  if (params.auth_storage_state) {
    auth.storageState = params.auth_storage_state as string;
    hasAuth = true;
  }
  if (params.auth_username && params.auth_password) {
    auth.httpCredentials = { username: params.auth_username as string, password: params.auth_password as string };
    hasAuth = true;
  }
  if (params.auth_bearer_token) {
    auth.headers = { ...auth.headers, Authorization: `Bearer ${params.auth_bearer_token as string}` };
    hasAuth = true;
  }
  if (params.auth_headers) {
    auth.headers = { ...auth.headers, ...(params.auth_headers as Record<string, string>) };
    hasAuth = true;
  }
  if (params.auth_cookies) {
    auth.cookies = params.auth_cookies as AuthOptions["cookies"];
    hasAuth = true;
  }
  if (params.auth_login_url && params.auth_login_fields) {
    auth.login = {
      url: params.auth_login_url as string,
      fields: params.auth_login_fields as Record<string, string>,
      submit: params.auth_login_submit as string | undefined,
    };
    hasAuth = true;
  }

  return hasAuth ? auth : undefined;
}

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
      ...AuthParamsSchema,
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
        auth: buildAuthOptions(params),
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
      ...AuthParamsSchema,
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
          auth: buildAuthOptions(params),
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

  // ── Tool: smart_announce ────────────────────────────────────────────

  server.tool(
    "smart_announce",
    "AI-driven announcement: analyzes changes, decides what to screenshot from a running app, captures screenshots, " +
    "then writes platform-optimized posts that reference the visuals. The AI sees the actual screenshots and writes " +
    "about what's visible. Requires: AI API key configured, Playwright installed, and the app running at the given URL.",
    {
      app_url: z.string().describe("URL of the running app to screenshot"),
      description: z.string().optional().describe("What the update is about (optional if using git)"),
      from_git: z.boolean().optional().describe("Parse recent git commits for changelog (default: true)"),
      commits: z.string().optional().describe("Number of commits or git range (e.g., '10' or 'v1.0..HEAD')"),
      since: z.string().optional().describe("Include commits since this date (e.g., '2026-03-01')"),
      tag: z.string().optional().describe("Include commits since this tag"),
      project_name: z.string().optional().describe("Project name (auto-detected from git if omitted)"),
      version: z.string().optional().describe("Version string (e.g., 'v2.1.0')"),
      url: z.string().optional().describe("Project URL to include in posts"),
      tone: z.enum(["professional", "casual", "excited"]).optional().describe("Writing tone (default: casual)"),
      verbosity: z.enum(["brief", "normal", "detailed"]).optional().describe("Content verbosity (default: normal)"),
      platforms: z.string().optional().describe("Comma-separated platform names (default: all configured)"),
      exclude: z.string().optional().describe("Comma-separated platforms to skip"),
      screenshot_device: z.string().optional().describe("Device preset for screenshots (e.g., 'macbook-pro')"),
      screenshot_dark_mode: z.boolean().optional().describe("Use dark mode for screenshots"),
      screenshot_hide: z.array(z.string()).optional().describe("CSS selectors to hide in screenshots"),
      screenshot_delay: z.number().optional().describe("Delay in ms before each screenshot capture"),
      max_screenshots: z.number().optional().describe("Max screenshots to capture (default: 4)"),
      dry_run: z.boolean().optional().describe("Preview without posting"),
      ai_provider: z.string().optional().describe("AI provider override (anthropic or openai)"),
      ai_model: z.string().optional().describe("AI model override"),
      ...AuthParamsSchema,
    },
    async (params) => {
      // Preflight checks
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

      const config = loadConfig();

      // Build AI options
      const aiOpts = buildAiOptions(config.ai, {
        provider: params.ai_provider,
        model: params.ai_model,
      });
      if (!aiOpts) {
        return {
          content: [{ type: "text", text: "AI API key not configured. Run `crosspost init` and set up AI to use smart_announce." }],
          isError: true,
        };
      }

      // Build adapters
      const postOptions: PostOptions = {
        only: params.platforms?.split(",").map((s) => s.trim()),
        exclude: params.exclude?.split(",").map((s) => s.trim()),
      };
      const allAdapters = createAdapters(config, postOptions);
      const adapters = filterAdapters(allAdapters, postOptions);

      if (adapters.size === 0) {
        return {
          content: [{ type: "text", text: "No platforms configured or all filtered out." }],
          isError: true,
        };
      }

      // Gather context
      let changelog;
      const useGit = params.from_git !== false;
      if (useGit) {
        try {
          changelog = await getCommitRange({
            commits: params.commits,
            since: params.since,
            tag: params.tag,
          });
        } catch {
          // Git not available, continue without changelog
        }
      }

      const projectName = params.project_name ?? (await getProjectName().catch(() => "Project"));
      const tone = (params.tone ?? "casual") as Tone;
      const template = detectTemplate(changelog);

      const context = {
        projectName,
        version: params.version,
        description: params.description,
        changelog,
        url: params.url,
        tone,
        template,
      };

      if (!params.description && !changelog) {
        return {
          content: [{ type: "text", text: "No description or git history available. Provide a description or ensure you're in a git repository." }],
          isError: true,
        };
      }

      // Get diff for extra context
      let diff: string | undefined;
      if (useGit) {
        try {
          diff = await getDiffForRange({ commits: params.commits, since: params.since, tag: params.tag }) || undefined;
        } catch {
          // Continue without diff
        }
      }

      // Status messages collected for the response
      const statusLog: string[] = [];

      try {
        // Run the agentic loop
        const result = await runAgentLoop({
          aiOptions: aiOpts,
          context,
          appUrl: params.app_url,
          adapters,
          verbosity: params.verbosity as Verbosity | undefined,
          diff,
          screenshotDefaults: {
            device: params.screenshot_device,
            darkMode: params.screenshot_dark_mode,
            hide: params.screenshot_hide,
            delay: params.screenshot_delay,
          },
          maxScreenshots: params.max_screenshots,
          auth: buildAuthOptions(params),
          onStatus: (_phase, detail) => {
            statusLog.push(detail);
          },
        });

        // Dry run: return preview
        if (params.dry_run) {
          const preview = Array.from(adapters.entries()).map(([key, adapter]) => ({
            platform: key,
            text: result.texts.get(key) ?? "",
            charCount: (result.texts.get(key) ?? "").length,
            maxLength: adapter.maxTextLength,
            screenshotIndices: result.selectedScreenshots.get(key) ?? [],
          }));

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                dryRun: true,
                plan: {
                  reasoning: result.plan.reasoning,
                  screenshots: result.plan.screenshots.map((s) => s.description),
                },
                screenshotsCaptured: result.screenshots.length,
                platforms: preview,
                statusLog,
              }, null, 2),
            }],
          };
        }

        // Post to all platforms with per-platform text and screenshots
        const postOpts: PostOptions = {
          ...postOptions,
          perPlatformText: {},
        };

        for (const [key] of adapters) {
          if (result.texts.has(key)) {
            postOpts.perPlatformText![key] = result.texts.get(key)!;
          }
        }

        // Use the first platform's screenshots as the default image set
        // (postToAll sends the same images to all platforms)
        const bestScreenshots = result.screenshots.length > 0
          ? [result.screenshots[0].buffer]
          : [];

        const defaultText = context.description ?? changelog?.summary ?? "Update";
        const postResults = await postToAll(
          adapters,
          { text: defaultText, images: bestScreenshots.length > 0 ? bestScreenshots : undefined, url: context.url },
          postOpts,
        );

        const succeeded = postResults.filter((r) => r.success).length;
        const failed = postResults.filter((r) => !r.success).length;
        const summary = postResults.map((r) => ({
          platform: r.platform,
          success: r.success,
          url: r.url,
          channel: r.channel,
          error: r.error,
          durationMs: r.durationMs,
        }));

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              plan: {
                reasoning: result.plan.reasoning,
                screenshots: result.plan.screenshots.map((s) => s.description),
              },
              screenshotsCaptured: result.screenshots.length,
              posted: `${succeeded} succeeded, ${failed} failed`,
              results: summary,
              statusLog,
            }, null, 2),
          }],
          isError: failed > 0 && succeeded === 0,
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Smart announce failed: ${err instanceof Error ? err.message : String(err)}\n\nStatus log:\n${statusLog.join("\n")}`,
          }],
          isError: true,
        };
      }
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
