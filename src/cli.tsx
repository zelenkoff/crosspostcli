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
  .option("--discord <text>", "Custom text for Discord")
  .option("--medium <text>", "Custom text for Medium")
  .option("--blog-slug <slug>", "Blog post slug")
  .option("--blog-title <title>", "Blog post title")
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

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nInterrupted. Exiting...");
  process.exit(0);
});

program.parse();
