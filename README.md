# CrossPost

Cross-platform content publishing from the terminal. Bring your own API keys. No server. No subscription.

Post to **Telegram**, **X (Twitter)**, **Bluesky**, **Mastodon**, **Discord**, **Medium**, and your **blog** — all at once.

## Features

- Post to multiple platforms simultaneously with a single command
- Interactive setup wizard — connect platforms in minutes
- Per-platform text overrides for tailored messaging
- Screenshot capture with device emulation (powered by Playwright)
- Dry-run preview before posting
- JSON output for scripting and automation
- MCP server for AI agent integration
- Encrypted credential storage (AES-256-GCM)
- Pipe-friendly: status to stderr, data to stdout

## Requirements

- [Bun](https://bun.sh) >= 1.0.0

## Install

```bash
git clone https://github.com/zelenkoff/crosspostcli.git
cd crosspostcli
bun install
```

### Build a standalone binary

```bash
bun run build
# produces ./dist/crosspost
```

## Quick Start

```bash
# Run the setup wizard to connect your platforms
bun run src/cli.tsx init

# Check which platforms are connected
bun run src/cli.tsx status

# Post to all connected platforms
bun run src/cli.tsx "Hello from CrossPost!"

# Preview without posting
bun run src/cli.tsx "Hello" --dry-run
```

## Usage

```
crosspost [text] [options]
```

If no text is provided, an interactive UI is shown.

### Posting

```bash
# Post text
crosspost "New blog post is live!"

# Post with an image
crosspost "Check this out" --image photo.png

# Post to specific platforms only
crosspost "Hello Fediverse" --only mastodon,bluesky

# Exclude a platform
crosspost "Not for Discord" --exclude discord

# Read text from a file
crosspost --from post.txt

# Read text from stdin
echo "Hello" | crosspost --stdin

# Per-platform text overrides
crosspost "Default text" \
  --telegram "Custom Telegram text" \
  --x "Short for Twitter" \
  --bluesky "Hello Bluesky!"

# Append a URL to all posts
crosspost "Read more" --url https://example.com

# JSON output for scripting
crosspost "Hello" --json
```

### Screenshots

Capture web page screenshots and optionally attach them to posts.

```bash
# Take a screenshot
crosspost screenshot https://example.com

# Capture a specific element
crosspost screenshot https://example.com --selector ".hero"

# Mobile device emulation
crosspost screenshot https://example.com --device iphone-14

# Post with a screenshot attached
crosspost "Look at this page" --screenshot https://example.com

# First-time setup (installs Playwright + Chromium)
crosspost screenshot --setup
```

**Available devices:** `iphone-14`, `iphone-15-pro`, `ipad`, `pixel-7`, `desktop-hd`, `desktop-4k`, `macbook-pro`, plus all Playwright device names.

**Screenshot options:** `--selector`, `--highlight`, `--hide`, `--device`, `--width`, `--height`, `--delay`, `--format`, `--quality`, `--full-page`, `--dark-mode`, `--output`

**Presets:** Save screenshot options for reuse with `--save-preset <name>`, apply with `--preset <name>`, list with `--list-presets`.

### Announce — Smart Content Generation

Generate platform-tailored announcements from git history or a description. Produces short tweets for X/Bluesky, medium posts for Mastodon, full changelogs for Telegram/Discord, and markdown articles for Medium/Blog — all from a single command.

```bash
# Announce from a description
crosspost announce "We just shipped dark mode and PDF export"

# Generate from git history since a tag
crosspost announce --from-git --tag v1.0 --version "2.0"

# Generate from recent commits with a link
crosspost announce --from-git --since 2026-03-01 --url https://example.com/changelog

# Generate from a commit range
crosspost announce --from-git --commits "v1.0..v1.1"

# Preview without posting
crosspost announce "New release" --dry-run

# Screenshot the app and include it
crosspost announce --from-git --tag v1.0 \
  --screenshot http://localhost:3000 \
  --screenshot-highlight ".new-feature"

# Control the tone
crosspost announce "Big update" --tone excited --version "3.0"

# Skip confirmation (for CI)
crosspost announce --from-git --tag v1.0 --no-confirm --json
```

**Source options:** `--from-git`, `--commits <range>`, `--since <date>`, `--tag <tag>`, `--from <file>`

**Content options:** `--project-name <name>`, `--version <ver>`, `--url <url>`, `--tone` (`professional` | `casual` | `excited`), `--template` (`release` | `feature` | `bugfix` | `update`)

The command auto-detects the template type from your commits: feature-only changelogs get a "feature" template, fix-only get "bugfix", mixed get "release". Content is automatically sized per platform — a 280-char tweet, a 500-char toot, a full changelog for Telegram, and a markdown article for your blog.

### Commands

| Command | Description |
|---------|-------------|
| `crosspost [text]` | Post to all connected platforms |
| `crosspost announce [desc]` | Generate and post announcements from git history |
| `crosspost init` | Interactive setup wizard |
| `crosspost status` | Show connected platforms |
| `crosspost test [platform]` | Send a test message |
| `crosspost config` | Show current config |
| `crosspost config set <key> <value>` | Set a config value (dot notation) |
| `crosspost config get <key>` | Get a config value |
| `crosspost config reset` | Reset config to defaults |
| `crosspost screenshot [url]` | Capture a web page screenshot |
| `crosspost mcp` | Start MCP server for AI agents |

## Supported Platforms

| Platform | Max Length | Images | Rich Text |
|----------|-----------|--------|-----------|
| Telegram | 4,096 | Yes | HTML |
| X (Twitter) | 280 | Yes | Plain |
| Bluesky | 300 | Yes | Rich text facets |
| Mastodon | 500 | Yes | Plain |
| Discord | 2,000 | Yes | Markdown |
| Medium | 100,000 | No | HTML / Markdown |
| Blog (Git) | 100,000 | Yes | Markdown / MDX |

### Platform Setup

Each platform requires its own API credentials. Run `crosspost init` for a guided setup, or configure manually:

**Telegram** — Bot token from [@BotFather](https://t.me/BotFather) + channel IDs

**X (Twitter)** — OAuth 1.0a credentials (API key, API secret, access token, access secret) from the [Developer Portal](https://developer.twitter.com)

**Bluesky** — Handle (e.g. `you.bsky.social`) + [app password](https://bsky.app/settings/app-passwords)

**Mastodon** — Instance URL + access token from your instance's developer settings

**Discord** — [Webhook URL(s)](https://support.discord.com/hc/en-us/articles/228383668) for your channels

**Medium** — [Integration token](https://medium.com/me/settings/security) from your security settings

**Blog** — Path to your blog's content directory, file type (md/mdx), optional git push and deploy command

## Configuration

Config is stored at `~/.crosspost/config.json` with secrets encrypted using AES-256-GCM.

```bash
# View config (secrets masked)
crosspost config

# Set a value
crosspost config set platforms.telegram.bot_token "your-token"

# Get a value
crosspost config get platforms.telegram.enabled
```

## MCP Server

CrossPost includes an MCP (Model Context Protocol) server so AI agents can post on your behalf.

```bash
crosspost mcp
```

**Available tools:** `post`, `status`, `validate`, `screenshot`, `post_with_screenshot`, `list_devices`

Add to your AI agent's MCP config:

```json
{
  "mcpServers": {
    "crosspost": {
      "command": "crosspost",
      "args": ["mcp"]
    }
  }
}
```

## Contributing

### Project Structure

```
src/
  cli.tsx          — Entry point, argument parsing
  app.tsx          — Root Ink component
  commands/        — One file per CLI command
  ui/              — Reusable Ink components
  adapters/        — Platform adapters
  config/          — Config management and encryption
  core/            — Posting engine orchestrator
  screenshot/      — Playwright integration (lazy-loaded)
  mcp/             — MCP server for AI agents
  utils/           — Shared utilities
```

### Development

```bash
# Run in dev mode
bun run dev

# Run tests
bun test

# Type check
bun run typecheck
```

### Adding a New Platform Adapter

1. Create `src/adapters/your-platform.ts` implementing the `Adapter` interface:

```typescript
interface Adapter {
  name: string;
  validate(): Promise<boolean>;
  post(content: PostContent): Promise<PostResult[]>;
  maxTextLength: number;
  supportsImages: boolean;
  supportsHtml: boolean;
  supportsMarkdown: boolean;
  formatText(text: string): string;
}
```

2. Add the platform's config schema to `src/config/schema.ts`
3. Register the adapter in `src/core/engine.ts`
4. Add setup prompts in `src/commands/init.tsx`
5. Write tests in `tests/adapters/`

### Design Principles

- **Instant feedback** — Never leave the user staring at a blank terminal
- **Smart defaults** — The common case needs zero flags
- **Graceful errors** — Every error suggests a fix
- **Parallel posting** — All platforms post concurrently via `Promise.allSettled()`
- **Lazy loading** — Heavy dependencies (Playwright) loaded only when needed
- **Pipe-friendly** — Status to stderr, data to stdout, `--json` for scripting

## License

MIT
