import { describe, test, expect } from "bun:test";
import {
  generateForPlatform,
  generateAllPlatforms,
  detectTemplate,
  type AnnounceContext,
} from "../../src/core/announce-templates.js";
import type { Adapter, PostContent, PostResult } from "../../src/adapters/types.js";
import type { Changelog, CommitInfo } from "../../src/core/changelog.js";

function mockAdapter(overrides: Partial<Adapter> = {}): Adapter {
  return {
    name: "TestPlatform",
    maxTextLength: 280,
    supportsImages: true,
    supportsHtml: false,
    supportsMarkdown: false,
    validate: async () => true,
    post: async (_content: PostContent): Promise<PostResult[]> => [],
    formatText: (text: string) => text.slice(0, 280),
    ...overrides,
  };
}

function mockCommit(overrides: Partial<CommitInfo> = {}): CommitInfo {
  return {
    hash: "abc12345",
    subject: "Add new feature",
    body: "",
    type: "feat",
    date: "2026-03-24",
    ...overrides,
  };
}

function mockChangelog(overrides: Partial<Changelog> = {}): Changelog {
  const features = [mockCommit({ subject: "Add dark mode" }), mockCommit({ subject: "Add export to PDF" })];
  const fixes = [mockCommit({ type: "fix", subject: "Fix login crash" })];
  return {
    commits: [...features, ...fixes],
    features,
    fixes,
    other: [],
    range: "v1.0..v1.1",
    summary: "2 new features, 1 bug fix",
    ...overrides,
  };
}

describe("announce-templates", () => {
  describe("detectTemplate", () => {
    test("returns 'feature' for features-only changelog", () => {
      expect(detectTemplate(mockChangelog({ fixes: [] }))).toBe("feature");
    });

    test("returns 'bugfix' for fixes-only changelog", () => {
      expect(detectTemplate(mockChangelog({ features: [] }))).toBe("bugfix");
    });

    test("returns 'release' for mixed changelog", () => {
      expect(detectTemplate(mockChangelog())).toBe("release");
    });

    test("returns 'update' for empty changelog", () => {
      expect(detectTemplate(undefined)).toBe("update");
    });
  });

  describe("generateForPlatform", () => {
    const baseCtx: AnnounceContext = {
      projectName: "MyApp",
      version: "2.0",
      tone: "casual",
      template: "release",
      changelog: mockChangelog(),
      url: "https://example.com/release",
    };

    test("generates short content for twitter-like platforms", () => {
      const adapter = mockAdapter({ maxTextLength: 280 });
      const text = generateForPlatform(baseCtx, "x", adapter);
      expect(text.length).toBeLessThanOrEqual(280);
      expect(text).toContain("MyApp");
    });

    test("generates medium content for mastodon-like platforms", () => {
      const adapter = mockAdapter({ maxTextLength: 500 });
      const text = generateForPlatform(baseCtx, "mastodon", adapter);
      expect(text.length).toBeLessThanOrEqual(500);
      expect(text).toContain("MyApp");
    });

    test("generates long content for telegram-like platforms", () => {
      const adapter = mockAdapter({ maxTextLength: 4096 });
      const text = generateForPlatform(baseCtx, "telegram", adapter);
      expect(text).toContain("MyApp");
      expect(text).toContain("What's new");
      expect(text).toContain("Add dark mode");
    });

    test("generates article content for blog-like platforms", () => {
      const adapter = mockAdapter({
        maxTextLength: 100000,
        supportsMarkdown: true,
      });
      const text = generateForPlatform(baseCtx, "blog", adapter);
      expect(text).toContain("# ");
      expect(text).toContain("## What's New");
      expect(text).toContain("Add dark mode");
      expect(text).toContain("https://example.com/release");
    });

    test("uses description when provided", () => {
      const ctx: AnnounceContext = {
        ...baseCtx,
        description: "We just launched a redesign",
      };
      const adapter = mockAdapter({ maxTextLength: 280 });
      const text = generateForPlatform(ctx, "x", adapter);
      expect(text).toContain("We just launched a redesign");
    });

    test("respects tone=professional", () => {
      const ctx: AnnounceContext = { ...baseCtx, tone: "professional" };
      const adapter = mockAdapter({ maxTextLength: 500 });
      const text = generateForPlatform(ctx, "mastodon", adapter);
      // Professional tone should not start with emoji
      expect(text[0]).not.toMatch(/[^\w]/);
    });

    test("respects tone=excited", () => {
      const ctx: AnnounceContext = { ...baseCtx, tone: "excited" };
      const adapter = mockAdapter({ maxTextLength: 4096 });
      const text = generateForPlatform(ctx, "telegram", adapter);
      expect(text).toContain("!");
    });

    test("includes URL when provided", () => {
      const adapter = mockAdapter({ maxTextLength: 4096 });
      const text = generateForPlatform(baseCtx, "telegram", adapter);
      expect(text).toContain("https://example.com/release");
    });
  });

  describe("generateAllPlatforms", () => {
    test("generates for all adapters", () => {
      const ctx: AnnounceContext = {
        projectName: "MyApp",
        tone: "casual",
        template: "update",
        description: "New update",
      };
      const adapters = new Map<string, Adapter>([
        ["x", mockAdapter({ name: "X", maxTextLength: 280 })],
        ["telegram", mockAdapter({ name: "Telegram", maxTextLength: 4096 })],
      ]);
      const results = generateAllPlatforms(ctx, adapters);
      expect(results.size).toBe(2);
      expect(results.has("x")).toBe(true);
      expect(results.has("telegram")).toBe(true);
    });
  });
});
