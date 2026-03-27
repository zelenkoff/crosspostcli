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
    "- Telegram supports HTML: <b>, <i>, <code>, <pre>, <a href>. Use these for structure.\n" +
    "- STRUCTURE (strictly follow this layout):\n" +
    "    <b>🔖 Title or main theme</b>\n" +
    "    (blank line)\n" +
    "    Short 1-2 sentence intro explaining what changed for the user.\n" +
    "    (blank line)\n" +
    "    <b>What's new:</b>\n" +
    "    • Feature one — explain in plain terms what users can now do\n" +
    "    • Feature two — same\n" +
    "    (blank line)\n" +
    "    Closing sentence + link\n" +
    "- BLANK LINES ARE REQUIRED between each section — Telegram renders them as visual spacing.\n" +
    "- Never run all features into one dense paragraph with no breaks.\n" +
    "- Each bullet on its own line, starting with •.\n" +
    "- Keep under 4096 chars. Lead with the most impactful change.\n" +
    "- Write for a non-technical audience: what users see and can do, not how it was built.\n" +
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
    "- Plain text only. No HTML. No markdown.\n" +
    "- Each post in the thread is max 280 characters (leave room for breathing).\n" +
    "- THREAD FORMAT (use when there are 2+ distinct features or screenshots):\n" +
    "  Post 1 (root): Hook — the single most exciting thing about this update. One or two punchy sentences. No list.\n" +
    "  Post 2+: One feature per post. Start with the feature name or emoji, then explain what users can NOW do in plain language. Attach the relevant screenshot to each post.\n" +
    "  Last post: Closing — where to try it, link, or next steps.\n" +
    "- SINGLE POST FORMAT (use when there is only 1 feature or no screenshots):\n" +
    "  One concise post under 280 chars. Hook → what changed → link.\n" +
    "- Each post must stand alone — no 'as mentioned above', no cross-references between posts.\n" +
    "- Human and conversational tone. No marketing speak, no jargon.",

  mastodon:
    "Mastodon post rules:\n" +
    "- Up to 500 characters. Plain text.\n" +
    "- More room to be descriptive than Twitter/Bluesky.\n" +
    "- 1-2 screenshots work well.\n" +
    "- Explain the value in human terms — what changed for the user.\n" +
    "- Conversational tone fits the platform culture.",

  medium:
    "Medium article rules:\n" +
    "- Write for a general audience, not developers. Hook them in the opening line.\n" +
    "- Structure: hook → before/now → walkthrough (one section per feature with screenshot) → payoff.\n" +
    "- Each feature section: describe what users see and can do, then immediately embed the screenshot that shows it.\n" +
    "- Use markdown headers (##, ###) named after USER BENEFITS, not technical categories.\n" +
    "  Bad: 'API Improvements'. Good: 'Search is Now Instant'.\n" +
    "- Short paragraphs (2-3 sentences). Let screenshots do the storytelling.\n" +
    "- Tell a story: what was the problem → what's new → what users get out of it.\n" +
    "- Write like you're explaining to a smart friend who doesn't read code.\n" +
    "- Open with a compelling hook, close with a specific link to try it.\n" +
    "- 600-1500 words. No code blocks, no jargon, no technical details.",

  devto:
    "DEV.to article rules:\n" +
    "- Write for developers and technical makers, but keep it human and approachable.\n" +
    "- Start with a # heading for the title, then a short intro paragraph that hooks the reader.\n" +
    "- Structure: hook → what changed and why → walkthrough (one ## section per feature with screenshot) → closing link.\n" +
    "- Use ## and ### markdown headers named after USER BENEFITS or outcomes.\n" +
    "  Bad: 'New API'. Good: 'Instant Search — No More Waiting'.\n" +
    "- Embed screenshots inline with ![description](./image-N.png) right after the paragraph describing each feature.\n" +
    "- Short paragraphs (2-3 sentences). Conversational and direct tone.\n" +
    "- You can mention stack/tech briefly but focus on what users can NOW do, not how it was built.\n" +
    "- End with a specific link to try it or see the changelog.\n" +
    "- 400-1200 words. No walls of text.",

  blog:
    "Blog post rules:\n" +
    "- Write as a human telling a friend what changed. Structure: hook → before/now → feature walkthrough → payoff.\n" +
    "- HOOK: Open with why this matters to the reader. Make them care in the first sentence.\n" +
    "- WALKTHROUGH: One section per user-facing change. Each section: 1-2 short paragraphs + the screenshot that shows it.\n" +
    "- SCREENSHOT PLACEMENT: Embed each screenshot RIGHT AFTER the paragraph describing that feature. Never cluster images.\n" +
    "- Use ## and ### headers named after user benefits ('Search is Now Instant', 'Export in One Click').\n" +
    "- Short paragraphs only (2-3 sentences). Let images carry the weight.\n" +
    "- No code blocks, no technical jargon, no implementation details. MDX supported.\n" +
    "- End with a specific link to try the feature — not a generic CTA.\n" +
    "- 400-1500 words depending on scope.",

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
  "You are a product storyteller who decides what screenshots to capture for a social media announcement. " +
  "You think like a user, not an engineer. You pick screenshots that show what CHANGED from the user's perspective — " +
  "new UI elements, improved workflows, visual differences they'd notice.\n\n" +
  "CRITICAL — SELECTOR EXTRACTION RULES:\n" +
  "- You MUST extract real CSS selectors from the code diff. Do NOT invent class names or IDs.\n" +
  "- If the diff shows `id=\"rec-settings\"` → use `#rec-settings` as the selector.\n" +
  "- If the diff shows `className=\"settings-card\"` → use `.settings-card` as the selector.\n" +
  "- If the diff shows a route like `app/products/page.tsx` → the URL is likely /products.\n" +
  "- If the diff shows `href=\"/storefront\"` → navigate to that exact path.\n\n" +
  "CRITICAL — TAB & ACCORDION NAVIGATION:\n" +
  "- If content is inside a tab, use `clicks` to activate it before screenshotting.\n" +
  "- Example: to show Recommendations tab → `\"clicks\": [\"[role='tab']:has-text('Recommendations')\"]`\n" +
  "- Try role+text selectors first, then data attributes like `[data-tab='recommendations']`.\n\n" +
  "DESCRIPTION QUALITY:\n" +
  "- Bad: 'The settings page'.\n" +
  "- Good: 'The storefront settings page — Recommendations tab — showing the new enable toggle and display location switches'.\n\n" +
  "You return JSON only.";

export const DEFAULT_COMPOSE_SYSTEM_PROMPT =
  "You are a product copywriter who writes for humans, not engineers. You are looking at actual screenshots of the application.\n\n" +
  "RULES FOR ALL POSTS:\n" +
  "- Write at an 8th-grade reading level. No jargon, no technical terms, no implementation details.\n" +
  "- Describe what users SEE and CAN DO, not how things work under the hood.\n" +
  "- Never mention: APIs, endpoints, algorithms, refactors, architecture, database, schema, middleware, components, modules, hooks, framework names, or code.\n" +
  "- Reference what's visible in the screenshots naturally — describe the UI elements you see, not abstract features.\n" +
  "- Never use generic CTAs like 'Check it out!' or 'Visit your dashboard!' without a specific URL.\n" +
  "- No hashtags unless explicitly asked.\n\n" +
  "FOR BLOG/MEDIUM ARTICLES — structure every article as a story with four parts:\n" +
  "  1. HOOK (1-2 sentences): Why should the reader care? Answer this before anything else.\n" +
  "  2. BEFORE/NOW (1 short paragraph): What was the problem? What changed?\n" +
  "  3. WALKTHROUGH (one section per feature/change): Describe what users see and can do. After each section, embed the matching screenshot.\n" +
  "  4. PAYOFF (1-2 sentences): What does the user get out of this? Link to try it.\n" +
  "- Write SHORT PARAGRAPHS (2-3 sentences). Let screenshots do the storytelling.\n" +
  "- Use markdown headers (## and ###) named after USER BENEFITS, not technical categories.\n" +
  "  Bad: 'API Changes', 'Database Optimizations'. Good: 'Search Now Works Instantly', 'Find Files in Seconds'.\n" +
  "- SCREENSHOT PLACEMENT: After you describe a feature, immediately embed the screenshot that shows it: ![brief description](./image-N.png). Distribute throughout — never pile at top or bottom.\n" +
  "- NO code blocks. NO technical explanations. NO mention of libraries, frameworks, or engineering decisions.\n" +
  "- Target 600-1200 words. Every section must answer 'so what?' from the user's perspective.\n\n" +
  "FOR TELEGRAM: End with a real clickable link using HTML <a href> tags. Never write 'Check it out' without a specific URL.\n\n" +
  "FOR SHORT PLATFORMS (X, Bluesky, Mastodon): One or two sentences about what's new, in plain language. One screenshot maximum.\n\n" +
  "You return JSON only. Never return markdown code fences — just valid JSON.";

export const DEFAULT_ANALYSIS_SYSTEM_PROMPT =
  "You are a content strategist who thinks about what matters to end users, not developers. " +
  "You analyze product changes and find the human story: what's new, what's better, what users will actually notice and care about. " +
  "You filter out everything that isn't visible or tangible to users: refactors, dependency updates, code cleanup, architecture changes, performance metrics not visible in the UI. " +
  "You express changes as 'Before, users had to X. Now, they can Y.' — always from the user's perspective. " +
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
