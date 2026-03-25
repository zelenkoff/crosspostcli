import { describe, test, expect } from "bun:test";
import {
  PLATFORM_FORMATTING_RULES,
  DEFAULT_PLAN_SYSTEM_PROMPT,
  DEFAULT_COMPOSE_SYSTEM_PROMPT,
  DEFAULT_ANALYSIS_SYSTEM_PROMPT,
  DEFAULT_SIMPLE_SYSTEM_PROMPT,
  buildPlatformInstructions,
  resolveSystemPrompt,
} from "../../src/core/platform-prompts.js";

describe("resolveSystemPrompt", () => {
  test("returns CLI override when provided", () => {
    const result = resolveSystemPrompt("default", "config-prompt", "cli-prompt");
    expect(result).toBe("cli-prompt");
  });

  test("returns config prompt when no CLI override", () => {
    const result = resolveSystemPrompt("default", "config-prompt");
    expect(result).toBe("config-prompt");
  });

  test("returns built-in default when no overrides", () => {
    const result = resolveSystemPrompt("default");
    expect(result).toBe("default");
  });

  test("CLI override takes priority over config", () => {
    const result = resolveSystemPrompt("default", "config", "cli");
    expect(result).toBe("cli");
  });

  test("config takes priority over default", () => {
    const result = resolveSystemPrompt("default", "config", undefined);
    expect(result).toBe("config");
  });
});

describe("PLATFORM_FORMATTING_RULES", () => {
  test("has rules for all known platforms", () => {
    expect(PLATFORM_FORMATTING_RULES.telegram).toBeDefined();
    expect(PLATFORM_FORMATTING_RULES.x).toBeDefined();
    expect(PLATFORM_FORMATTING_RULES.bluesky).toBeDefined();
    expect(PLATFORM_FORMATTING_RULES.mastodon).toBeDefined();
    expect(PLATFORM_FORMATTING_RULES.medium).toBeDefined();
    expect(PLATFORM_FORMATTING_RULES.blog).toBeDefined();
    expect(PLATFORM_FORMATTING_RULES.discord).toBeDefined();
  });

  test("telegram rules mention one screenshot and real link", () => {
    expect(PLATFORM_FORMATTING_RULES.telegram).toContain("ONE");
    expect(PLATFORM_FORMATTING_RULES.telegram).toContain("clickable link");
  });

  test("medium rules mention multiple screenshots", () => {
    expect(PLATFORM_FORMATTING_RULES.medium).toContain("MULTIPLE");
  });

  test("x rules mention 280 characters", () => {
    expect(PLATFORM_FORMATTING_RULES.x).toContain("280");
  });

  test("blog rules mention multiple screenshots", () => {
    expect(PLATFORM_FORMATTING_RULES.blog).toContain("MULTIPLE");
  });
});

describe("buildPlatformInstructions", () => {
  const platforms = [
    { key: "telegram", name: "Telegram", maxTextLength: 4096, supportsImages: true, supportsMarkdown: false, supportsHtml: true },
    { key: "x", name: "X/Twitter", maxTextLength: 280, supportsImages: true, supportsMarkdown: false, supportsHtml: false },
  ];

  test("includes platform names and keys", () => {
    const result = buildPlatformInstructions(platforms);
    expect(result).toContain("Telegram");
    expect(result).toContain('"telegram"');
    expect(result).toContain("X/Twitter");
    expect(result).toContain('"x"');
  });

  test("includes character limits", () => {
    const result = buildPlatformInstructions(platforms);
    expect(result).toContain("4096");
    expect(result).toContain("280");
  });

  test("includes formatting info", () => {
    const result = buildPlatformInstructions(platforms);
    expect(result).toContain("supports HTML");
    expect(result).toContain("plain text only");
  });

  test("includes platform-specific rules when available", () => {
    const result = buildPlatformInstructions(platforms);
    // Should include the telegram-specific rules from PLATFORM_FORMATTING_RULES
    expect(result).toContain("ONE main screenshot");
    // Should include x-specific rules
    expect(result).toContain("punchy and concise");
  });

  test("handles unknown platform gracefully", () => {
    const result = buildPlatformInstructions([
      { key: "unknown-platform", name: "Unknown", maxTextLength: 1000, supportsImages: false, supportsMarkdown: false, supportsHtml: false },
    ]);
    expect(result).toContain("Unknown");
    expect(result).toContain("1000");
  });
});

describe("default system prompts", () => {
  test("plan prompt focuses on user perspective", () => {
    expect(DEFAULT_PLAN_SYSTEM_PROMPT).toContain("user");
  });

  test("compose prompt mentions screenshots and no jargon", () => {
    expect(DEFAULT_COMPOSE_SYSTEM_PROMPT).toContain("screenshots");
    expect(DEFAULT_COMPOSE_SYSTEM_PROMPT).toContain("No jargon");
  });

  test("compose prompt discourages generic CTAs", () => {
    expect(DEFAULT_COMPOSE_SYSTEM_PROMPT).toContain("Never use generic marketing CTAs");
  });

  test("analysis prompt focuses on end users", () => {
    expect(DEFAULT_ANALYSIS_SYSTEM_PROMPT).toContain("end users");
  });

  test("simple prompt emphasizes human readability", () => {
    expect(DEFAULT_SIMPLE_SYSTEM_PROMPT).toContain("normal humans");
  });

  test("all prompts end with JSON instruction", () => {
    expect(DEFAULT_PLAN_SYSTEM_PROMPT).toContain("JSON only");
    expect(DEFAULT_COMPOSE_SYSTEM_PROMPT).toContain("JSON only");
    expect(DEFAULT_ANALYSIS_SYSTEM_PROMPT).toContain("JSON only");
    expect(DEFAULT_SIMPLE_SYSTEM_PROMPT).toContain("JSON only");
  });
});
