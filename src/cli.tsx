#!/usr/bin/env bun
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { App } from "./app.js";
import { runPostCommand } from "./commands/post.js";
import { runInitCommand } from "./commands/init.js";
import { runStatusCommand } from "./commands/status.js";
import { runConfigCommand } from "./commands/config.js";
import { runTestCommand } from "./commands/test-cmd.js";
import { runScreenshotCommand } from "./commands/screenshot.js";
import { startMcpServer } from "./mcp/server.js";
import { runAnnounceCommand } from "./commands/announce.js";

const VERSION = "0.1.0";

const program = new Command()
  .name("crosspost")
  .description("Cross-platform content publishing from the terminal")
  .version(VERSION);

// Default command — post text
program
  .argument("[text]", "Text to post to all connected platforms")
  .option("--image <paths...>", "Image file path(s) to attach")
  .option("--only <platforms>", "Post to specific platforms only (comma-separated)", (v) => v.split(","))
  .option("--exclude <platforms>", "Skip specific platforms (comma-separated)", (v) => v.split(","))
  .option("--dry-run", "Preview without posting")
  .option("--json", "Output as JSON")
  .option("--url <url>", "URL to append to posts")
  .option("--from <file>", "Read post text from file")
  .option("--stdin", "Read post text from stdin")
  .option("--verbose", "Show detailed output")
  .option("--telegram <text>", "Custom text for Telegram")
  .option("--x <text>", "Custom text for X/Twitter")
  .option("--bluesky <text>", "Custom text for Bluesky")
  .option("--mastodon <text>", "Custom text for Mastodon")
  .option("--blog-slug <slug>", "Blog post slug")
  .option("--blog-title <title>", "Blog post title")
  .option("--screenshot <url>", "Take screenshot of URL and attach to post")
  .option("--screenshot-selector <selector>", "CSS selector to capture")
  .option("--screenshot-highlight <selectors...>", "CSS selectors to highlight")
  .option("--screenshot-hide <selectors...>", "CSS selectors to hide")
  .option("--screenshot-device <device>", "Device emulation (e.g., iphone-14)")
  .option("--screenshot-delay <ms>", "Delay before capture in ms", parseInt)
  .option("--screenshot-preset <name>", "Use a saved screenshot preset")
  .option("--screenshot-dark", "Use dark mode for screenshot")
  .option("--headed", "Run browser in headed mode (visible window) for debugging")
  .action(async (text, opts) => {
    // If no text and no flags, show help
    if (!text && !opts.from && !opts.stdin && !process.stdin.isTTY === false) {
      const { waitUntilExit } = render(<App />);
      await waitUntilExit();
      return;
    }
    await runPostCommand({ text, ...opts });
  });

// Init wizard
program
  .command("init")
  .description("Interactive setup wizard — connect your platforms")
  .action(async () => {
    await runInitCommand();
  });

// Status
program
  .command("status")
  .description("Show connected platforms and their status")
  .action(async () => {
    await runStatusCommand();
  });

// Config management
program
  .command("config [action] [key] [value]")
  .description("Show or manage configuration (actions: set, get, reset)")
  .action(async (action, key, value) => {
    await runConfigCommand(action, key, value);
  });

// Test
program
  .command("test [platform]")
  .description("Send a test message to verify connections")
  .action(async (platform) => {
    await runTestCommand(platform);
  });

// Screenshot
program
  .command("screenshot [url]")
  .description("Take a screenshot of a web page")
  .option("--selector <selector>", "CSS selector to capture")
  .option("--highlight <selectors...>", "CSS selectors to highlight")
  .option("--hide <selectors...>", "CSS selectors to hide")
  .option("--device <device>", "Device emulation (e.g., iphone-14, macbook-pro)")
  .option("--width <pixels>", "Viewport width", parseInt)
  .option("--height <pixels>", "Viewport height", parseInt)
  .option("--delay <ms>", "Delay before capture in ms", parseInt)
  .option("--format <format>", "Output format: png or jpeg")
  .option("--quality <quality>", "JPEG quality 1-100", parseInt)
  .option("--full-page", "Capture full scrollable page")
  .option("--output <path>", "Save screenshot to specific path")
  .option("--preset <name>", "Use a saved preset")
  .option("--save-preset <name>", "Save current options as a preset")
  .option("--delete-preset <name>", "Delete a saved preset")
  .option("--list-presets", "List saved presets")
  .option("--list-devices", "List available device presets")
  .option("--setup", "Install Playwright and Chromium")
  .option("--dark-mode", "Use dark color scheme")
  .option("--headed", "Run browser in headed mode (visible window) for debugging")
  .option("--json", "Output result as JSON")
  .action(async (url, opts) => {
    await runScreenshotCommand(url, {
      ...opts,
      darkMode: opts.darkMode,
      fullPage: opts.fullPage,
      listPresets: opts.listPresets,
      listDevices: opts.listDevices,
      savePreset: opts.savePreset,
      deletePreset: opts.deletePreset,
    });
  });

// Announce — smart content generation from git history
program
  .command("announce [description]")
  .description("Generate and post announcements from git history or a description")
  .option("--from-git", "Auto-detect changes from git history")
  .option("--commits <range>", "Git commit range (e.g., v1.0..v1.1, HEAD~5..HEAD)")
  .option("--since <date>", "Commits since date (e.g., 2026-03-01)")
  .option("--tag <tag>", "Commits since tag (e.g., v1.0)")
  .option("--from <file>", "Read description from file")
  .option("--discover <url>", "Explore a running app to find and screenshot features")
  .option("--discover-keywords <words...>", "Extra keywords to search for in the app")
  .option("--discover-max-pages <n>", "Max pages to crawl (default: 8)", parseInt)
  .option("--discover-device <device>", "Device emulation for discovery (e.g., iphone-14)")
  .option("--screenshot <url>", "Take screenshot of app and attach to post")
  .option("--screenshot-selector <selector>", "CSS selector to capture")
  .option("--screenshot-highlight <selectors...>", "CSS selectors to highlight")
  .option("--screenshot-hide <selectors...>", "CSS selectors to hide")
  .option("--screenshot-device <device>", "Device emulation (e.g., iphone-14)")
  .option("--screenshot-delay <ms>", "Delay before capture in ms", parseInt)
  .option("--screenshot-preset <name>", "Use a saved screenshot preset")
  .option("--screenshot-dark", "Use dark mode for screenshot")
  .option("--project-name <name>", "Project name (default: git remote or dir name)")
  .option("--version <version>", "Version string to include")
  .option("--url <url>", "Link to release/changelog")
  .option("--tone <tone>", "Tone: professional, casual, excited (default: casual)")
  .option("--template <type>", "Template: release, feature, bugfix, update (default: auto-detect)")
  .option("--verbosity <level>", "Content verbosity: brief, normal, detailed (default: normal)")
  .option("--no-ai", "Disable AI content generation (use templates only)")
  .option("--ai-provider <provider>", "AI provider: anthropic, openai (default: from config)")
  .option("--ai-model <model>", "AI model to use (default: from config)")
  .option("--image <paths...>", "Image file path(s) to attach")
  .option("--only <platforms>", "Post to specific platforms only (comma-separated)", (v) => v.split(","))
  .option("--exclude <platforms>", "Skip specific platforms (comma-separated)", (v) => v.split(","))
  .option("--dry-run", "Preview without posting")
  .option("--json", "Output as JSON")
  .option("--no-confirm", "Skip interactive review (for CI/scripts)")
  .option("--web", "Open the browser-based preview editor after generating content")
  .option("--blog-slug <slug>", "Blog post slug")
  .option("--blog-title <title>", "Blog post title")
  .option("--telegram <text>", "Custom text for Telegram")
  .option("--x <text>", "Custom text for X/Twitter")
  .option("--bluesky <text>", "Custom text for Bluesky")
  .option("--mastodon <text>", "Custom text for Mastodon")
  .option("--auth-storage-state <path>", "Playwright storage state file for app auth (saved browser session)")
  .option("--auth-user <user>", "HTTP Basic Auth username for protected apps")
  .option("--auth-pass <pass>", "HTTP Basic Auth password for protected apps")
  .option("--auth-bearer <token>", "Bearer token for protected apps")
  .option("--auth-header <header...>", "Custom HTTP headers (key:value format, repeatable)")
  .option("--auth-login-url <url>", "Login page URL for form-based app auth")
  .option("--auth-login-fields <fields>", "Login form fields as JSON (e.g., '{\"#email\":\"user@example.com\",\"#password\":\"secret\"}')")
  .option("--auth-login-submit <selector>", "Login submit button selector (default: button[type=submit])")
  .option("--headed", "Run browser in headed mode (visible window) for debugging")
  .option("--slow-mo <ms>", "Slow down browser actions by ms (default: 800 when --headed)", parseInt)
  .option("--lang <code>", "Language code for this post (e.g. ru, en, es) — routes to matching channels and writes content in that language")
  .option("--system-prompt <prompt>", "Custom system prompt for AI content generation")
  .option("--system-prompt-file <path>", "Read system prompt from a file")
  .action(async (description, opts) => {
    // Build auth options from CLI flags
    const auth: Record<string, unknown> = {};
    let hasAuth = false;

    if (opts.authStorageState) {
      auth.storageState = opts.authStorageState;
      hasAuth = true;
    }
    if (opts.authUser && opts.authPass) {
      auth.httpCredentials = { username: opts.authUser, password: opts.authPass };
      hasAuth = true;
    }
    if (opts.authBearer) {
      auth.headers = { Authorization: `Bearer ${opts.authBearer}` };
      hasAuth = true;
    }
    if (opts.authHeader) {
      const headers: Record<string, string> = { ...(auth.headers as Record<string, string> ?? {}) };
      for (const h of opts.authHeader) {
        const idx = h.indexOf(":");
        if (idx > 0) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
      }
      auth.headers = headers;
      hasAuth = true;
    }
    if (opts.authLoginUrl && opts.authLoginFields) {
      try {
        auth.login = {
          url: opts.authLoginUrl,
          fields: JSON.parse(opts.authLoginFields),
          submit: opts.authLoginSubmit,
        };
        hasAuth = true;
      } catch {
        console.error('Error: --auth-login-fields must be valid JSON (e.g., \'{"#email":"user@example.com","#password":"secret"}\')');
        process.exit(1);
      }
    }

    // Resolve system prompt from file if specified
    let systemPrompt = opts.systemPrompt;
    if (!systemPrompt && opts.systemPromptFile) {
      const { readFileSync } = await import("fs");
      systemPrompt = readFileSync(opts.systemPromptFile, "utf-8").trim();
    }

    await runAnnounceCommand({
      description,
      ...opts,
      auth: hasAuth ? auth : undefined,
      systemPrompt,
    });
  });

// MCP server (for AI agents)
program
  .command("mcp")
  .description("Start MCP server for AI agent integration (stdio transport)")
  .action(async () => {
    await startMcpServer();
  });

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nInterrupted. Exiting...");
  process.exit(0);
});

program.parse();
