/**
 * Platform-specific formatting rules and configurable system prompts.
 *
 * Provides rich default prompts that encode per-platform best practices
 * (Telegram: one screenshot + structured text, Medium: article with inline images, etc.)
 * and allows users to override via --system-prompt or config.
 */

// ── Platform Formatting Rules ───────────────────────────────────────────

export const PLATFORM_FORMATTING_RULES: Record<string, string> = {
  telegram:
    "Telegram post rules:\n" +
    "- Use ONE main screenshot that shows the most impactful change.\n" +
    "- Structure with bold headers using HTML <b>tags</b>.\n" +
    "- Use bullet points for feature lists.\n" +
    "- Telegram supports HTML: <b>, <i>, <code>, <pre>, <a href>.\n" +
    "- Keep under 4096 chars. Lead with the most impactful change.\n" +
    "- Add a clear call-to-action at the end.",

  x:
    "X/Twitter post rules:\n" +
    "- Maximum 280 characters — be punchy and concise.\n" +
    "- One key screenshot maximum.\n" +
    "- Plain text only, no markdown.\n" +
    "- Hook the reader in the first line.\n" +
    "- Focus on the single most exciting change.\n" +
    "- No hashtags unless explicitly requested.",

  bluesky:
    "Bluesky post rules:\n" +
    "- Max 300 characters. Plain text.\n" +
    "- Slightly more descriptive than Twitter but still concise.\n" +
    "- One screenshot works best.\n" +
    "- Focus on what users can do now that they couldn't before.",

  mastodon:
    "Mastodon post rules:\n" +
    "- Up to 500 characters. Plain text.\n" +
    "- More room to be descriptive than Twitter/Bluesky.\n" +
    "- 1-2 screenshots work well.\n" +
    "- Developer audience appreciates technical details.\n" +
    "- Conversational tone fits the platform culture.",

  medium:
    "Medium article rules:\n" +
    "- Long-form article format with a compelling narrative.\n" +
    "- Use MULTIPLE screenshots placed contextually within the text — each screenshot should appear right after the paragraph that describes the feature it shows.\n" +
    "- Use markdown headers (##, ###) to structure sections.\n" +
    "- Include code blocks where relevant to show technical changes.\n" +
    "- Tell a story: problem → solution → impact.\n" +
    "- Open with a hook, close with a call-to-action.\n" +
    "- 800-2000 words is ideal.",

  blog:
    "Blog post rules:\n" +
    "- Full article format with MDX support.\n" +
    "- Use MULTIPLE screenshots with descriptive context — place each screenshot right after discussing the relevant feature.\n" +
    "- Use markdown headers, code blocks, and rich formatting.\n" +
    "- Detailed technical writing with code examples where relevant.\n" +
    "- Include a changelog/summary section for scanners.\n" +
    "- 500-3000 words depending on the scope of changes.",

  discord:
    "Discord post rules:\n" +
    "- Moderate length, supports markdown (bold, italic, code blocks, lists).\n" +
    "- 1-2 screenshots work well.\n" +
    "- Conversational, community-focused tone.\n" +
    "- Use embed-friendly formatting.\n" +
    "- Lead with what's exciting, then details.",
};

// ── Default System Prompts ──────────────────────────────────────────────

export const DEFAULT_PLAN_SYSTEM_PROMPT =
  "You are an expert developer advocate and technical content strategist. " +
  "You analyze software changes deeply — reading diffs, understanding architectural decisions, " +
  "and identifying what would resonate most with developers. " +
  "You think about visual storytelling: what screenshots would make a developer stop scrolling " +
  "and want to try the product. You consider the user journey and pick screenshots that show " +
  "real, tangible improvements users can relate to. " +
  "You return JSON only.";

export const DEFAULT_COMPOSE_SYSTEM_PROMPT =
  "You are a senior developer relations copywriter who writes compelling social media announcements. " +
  "You are looking at actual screenshots of the application you're writing about. " +
  "Your writing is authentic, specific, and avoids generic marketing language. " +
  "You describe what users will actually see and experience — point out visual details, " +
  "reference UI elements visible in the screenshots, and make the reader feel like they're using the app. " +
  "You adapt your writing style and structure to each platform's conventions and audience expectations. " +
  "You never use hashtags unless explicitly asked. You focus on what matters to users, not internal implementation details. " +
  "For platforms that support long-form content (blog, medium), you write detailed articles with multiple screenshots placed contextually. " +
  "For short-form platforms (X, Bluesky), you distill the most exciting change into a punchy message. " +
  "You return JSON only.";

export const DEFAULT_ANALYSIS_SYSTEM_PROMPT =
  "You are a senior technical content strategist. You analyze software changes to create " +
  "a content plan for social media announcements. You understand what developers care about: " +
  "performance improvements, new capabilities, better DX, visual changes, and bug fixes that " +
  "affected real users. You identify the narrative angle that will resonate most with the target audience. " +
  "You return JSON only.";

export const DEFAULT_SIMPLE_SYSTEM_PROMPT =
  "You are a developer relations copywriter. You write social media announcements for software releases. " +
  "You write in the specified tone and match each platform's character limits and formatting conventions exactly. " +
  "You adapt the content structure, depth, and screenshot usage to each platform's strengths. " +
  "You never use hashtags unless explicitly asked. You focus on what matters to users, not internal implementation details. " +
  "You return JSON only.";

// ── Helpers ─────────────────────────────────────────────────────────────

interface PlatformInfo {
  key: string;
  name: string;
  maxTextLength: number;
  supportsImages: boolean;
  supportsMarkdown: boolean;
  supportsHtml: boolean;
}

/**
 * Build platform-specific instructions block to include in AI prompts.
 */
export function buildPlatformInstructions(platforms: PlatformInfo[]): string {
  const parts: string[] = [];
  parts.push("## Platform-Specific Formatting Rules\n");
  parts.push("Each platform has different conventions. Follow these rules carefully:\n");

  for (const p of platforms) {
    const rules = PLATFORM_FORMATTING_RULES[p.key];
    const formatting = p.supportsMarkdown ? "supports markdown" : p.supportsHtml ? "supports HTML" : "plain text only";
    const imageNote = p.supportsImages ? "images supported" : "no image support";

    parts.push(`### ${p.name} (key: "${p.key}")`);
    parts.push(`Constraints: max ${p.maxTextLength} chars, ${formatting}, ${imageNote}`);
    if (rules) {
      parts.push(rules);
    }
    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Resolve the system prompt from multiple sources.
 * Priority: explicit override > config > built-in default.
 */
export function resolveSystemPrompt(
  builtInDefault: string,
  configPrompt?: string,
  cliOverride?: string,
): string {
  if (cliOverride) return cliOverride;
  if (configPrompt) return configPrompt;
  return builtInDefault;
}
