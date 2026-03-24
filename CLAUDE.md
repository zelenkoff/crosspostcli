# CrossPost — CLI for cross-platform content publishing

## Project Overview
CrossPost is a CLI tool that posts content to multiple social platforms from the terminal.
No server, no subscriptions — bring your own API keys.

## Tech Stack
- **Language:** TypeScript (strict)
- **Runtime:** Bun
- **UI:** React + Ink 5 (terminal UI framework)
- **Arg parsing:** Commander.js
- **Config validation:** Zod
- **Testing:** bun test

## Architecture
```
src/
  cli.tsx          — Entry point, argument parsing
  app.tsx          — Root Ink component
  commands/        — One file per CLI command
  ui/              — Reusable Ink components
  adapters/        — Platform adapters (telegram, x, bluesky, etc.)
  config/          — Config management (~/.crosspost/)
  core/            — Posting engine orchestrator
  screenshot/      — Playwright integration (lazy-loaded)
  mcp/             — MCP server for AI agents
  utils/           — Shared utilities
```

## Key Commands
```bash
bun run src/cli.tsx                    # Run CLI
bun run src/cli.tsx init               # Setup wizard
bun run src/cli.tsx "Hello" --dry-run  # Dry run post
bun run src/cli.tsx status             # Show connected platforms
bun test                               # Run tests
bunx tsc --noEmit                      # Type check
```

## Design Principles
- **Instant feedback:** Never leave user staring at blank terminal
- **Smart defaults:** Common case needs zero flags
- **Graceful errors:** Every error suggests a fix
- **Parallel posting:** All platforms post concurrently via Promise.allSettled()
- **Lazy loading:** Heavy deps (Playwright, Sharp) loaded only when needed
- **Pipe-friendly:** Status to stderr, data to stdout, --json for scripting

## Platform Adapters
Each adapter implements the Adapter interface from src/adapters/types.ts:
- validate(): Test credentials
- post(content): Post content, returns results
- formatText(text): Platform-specific formatting

## Config
Stored at ~/.crosspost/config.json. Credentials encrypted with AES-256-GCM.
