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
    "- Write for a non-technical audience: explain what changed in terms of what users see and can do, not how it was built.\n" +
    "- End with a real, clickable link — either to the blog post, product page, release notes, or the app itself. " +
    "Use an HTML <a href> tag. NEVER write a generic placeholder like 'Visit your dashboard' or 'Check it out' without an actual URL. " +
    "If a project URL is provided in the context, use it. If a blog platform is among the targets, link to where the blog post will be published.",

  x:
    "X/Twitter post rules:\n" +
    "- Maximum 280 characters — be punchy and concise.\n" +
    "- One key screenshot maximum.\n" +
    "- Plain text only, no markdown.\n" +
    "- Hook the reader in the first line.\n" +
    "- Focus on the single most exciting user-facing change.\n" +
    "- Write so anyone can understand it — no jargon, no implementation details.\n" +
    "- No hashtags unless explicitly requested.",

  bluesky:
    "Bluesky post rules:\n" +
    "- Max 300 characters. Plain text.\n" +
    "- Slightly more descriptive than Twitter but still concise.\n" +
    "- One screenshot works best.\n" +
    "- Focus on what users can do now that they couldn't before.\n" +
    "- Keep it human and conversational — no marketing speak.",

  mastodon:
    "Mastodon post rules:\n" +
    "- Up to 500 characters. Plain text.\n" +
    "- More room to be descriptive than Twitter/Bluesky.\n" +
    "- 1-2 screenshots work well.\n" +
    "- Explain the value in human terms — what changed for the user.\n" +
    "- Conversational tone fits the platform culture.",

  medium:
    "Medium article rules:\n" +
    "- Long-form article written for a general audience, not just developers.\n" +
    "- Use MULTIPLE screenshots placed contextually within the text — each screenshot should appear right after the paragraph that describes the feature it shows.\n" +
    "- Use markdown headers (##, ###) to structure sections.\n" +
    "- Focus on the USER EXPERIENCE: what changed, what it looks like, how it helps. Avoid implementation details, code snippets, and technical jargon.\n" +
    "- Tell a story: what was the problem → what's new → what users get out of it.\n" +
    "- Write like you're explaining it to a smart friend who doesn't read code.\n" +
    "- Open with a compelling hook, close with a link to try it.\n" +
    "- 600-1500 words is the sweet spot.",

  blog:
    "Blog post rules:\n" +
    "- Article format with MDX support.\n" +
    "- Use MULTIPLE screenshots with descriptive context — place each screenshot right after discussing the relevant feature.\n" +
    "- Use markdown headers and rich formatting.\n" +
    "- Write for humans first: lead with what changed for users, what it looks like, and why it matters.\n" +
    "- Keep technical details minimal — only include code if the audience is explicitly developers AND the code is directly relevant.\n" +
    "- Prefer showing over telling: let the screenshots do the heavy lifting, write short paragraphs around them.\n" +
    "- Every section should answer 'so what?' from a user's perspective.\n" +
    "- 400-1500 words depending on the scope of changes.",

  discord:
    "Discord post rules:\n" +
    "- Moderate length, supports markdown (bold, italic, code blocks, lists).\n" +
    "- 1-2 screenshots work well.\n" +
    "- Conversational, community-focused tone.\n" +
    "- Write like you're sharing exciting news with your community — casual and human.\n" +
    "- Lead with what's exciting, then details.",
};

// ── Default System Prompts ──────────────────────────────────────────────

export const DEFAULT_PLAN_SYSTEM_PROMPT =
  "You are a product storyteller who decides what screenshots to capture. " +
  "You think like a user, not an engineer. You pick screenshots that show what CHANGED from the user's perspective — " +
  "new UI elements, improved workflows, visual differences they'd notice. " +
  "You ignore internal refactors, code changes, and technical plumbing that aren't visible in the UI. " +
  "You return JSON only.";

export const DEFAULT_COMPOSE_SYSTEM_PROMPT =
  "You are a product copywriter who writes for humans, not engineers. " +
  "You are looking at actual screenshots of the application. " +
  "CRITICAL RULES:\n" +
  "- Write at an 8th-grade reading level. No jargon, no technical terms, no implementation details.\n" +
  "- Describe what users SEE and CAN DO, not how things work under the hood.\n" +
  "- Never mention: APIs, endpoints, algorithms, refactors, architecture, database, schema, middleware, components, modules, hooks, or any code concepts.\n" +
  "- For blog/medium: write a human-interest article with screenshots inline. Short paragraphs. Let images tell the story. NO code blocks.\n" +
  "- For Telegram: end with a real clickable link (to blog, product, or release), not a vague 'check it out' CTA.\n" +
  "- For short platforms (X, Bluesky): one sentence about what's new, in plain language.\n" +
  "- Never use generic marketing CTAs like 'Check it out!' or 'Visit your dashboard!'. Instead, link to a specific URL.\n" +
  "- No hashtags unless explicitly asked.\n" +
  "- Reference what's visible in the screenshots naturally — describe the UI, not the code behind it.\n" +
  "You return JSON only.";

export const DEFAULT_ANALYSIS_SYSTEM_PROMPT =
  "You are a content strategist who thinks about what matters to end users, not developers. " +
  "You analyze product changes and identify the story: what's new, what's better, what users will notice. " +
  "You filter out internal technical changes (refactors, dependency updates, code cleanup) that don't affect the user experience. " +
  "You focus on visible, tangible improvements. " +
  "You return JSON only.";

export const DEFAULT_SIMPLE_SYSTEM_PROMPT =
  "You are a product copywriter. You write announcements that normal humans can understand. " +
  "You match each platform's character limits and formatting conventions exactly. " +
  "You write about what changed for users, not how it was built. " +
  "No jargon, no technical terms, no code references. Write like you're telling a friend what's new. " +
  "You never use hashtags unless explicitly asked. " +
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
