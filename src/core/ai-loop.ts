/**
 * AI Agentic Loop — Two-pass screenshot-aware content generation.
 *
 * Pass 1 (Plan):  AI sees changelog/context/app URL → returns screenshot instructions
 * Pass 2 (Compose): AI sees the captured screenshots (vision) → writes posts referencing them
 *
 * This replaces the disconnected discover→screenshot→generate pipeline with a single
 * coherent AI-driven flow where the same model decides what to capture AND writes
 * about what it sees.
 */

import type { Adapter } from "../adapters/types.js";
import type { Changelog } from "./changelog.js";
import type { AnnounceContext, Tone, Verbosity } from "./announce-templates.js";
import type { AiGenerateOptions } from "./ai-generator.js";
import type { ScreenshotOptions, AuthOptions } from "../screenshot/capture.js";
import {
  DEFAULT_PLAN_SYSTEM_PROMPT,
  DEFAULT_COMPOSE_SYSTEM_PROMPT,
  DEFAULT_ANALYSIS_SYSTEM_PROMPT,
  buildPlatformInstructions,
  resolveSystemPrompt,
} from "./platform-prompts.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface ScreenshotInstruction {
  url: string;
  selector?: string;
  highlight?: string[];
  /** CSS selectors to click (in order) after page load, before screenshotting — use for tabs, accordions, dropdowns */
  clicks?: string[];
  description: string;
}

export interface ScreenshotPlan {
  screenshots: ScreenshotInstruction[];
  reasoning: string;
}

export interface CapturedScreenshot {
  instruction: ScreenshotInstruction;
  buffer: Buffer;
  width: number;
  height: number;
}

/** Content plan produced by the analysis phase */
export interface ContentPlan {
  /** Key changes explained in plain language */
  keyChanges: string[];
  /** The narrative angle for the announcement */
  narrativeAngle: string;
  /** Target audience for this announcement */
  targetAudience: string;
  /** What UI elements to look for and why */
  screenshotStrategy: string;
  /** Suggested tone observations */
  suggestedTone: string;
}

export interface AgentLoopOptions {
  aiOptions: AiGenerateOptions;
  context: AnnounceContext;
  appUrl: string;
  adapters: Map<string, Adapter>;
  verbosity?: Verbosity;
  /** General diff for analysis/compose context (truncated) */
  diff?: string;
  /** UI-only diff for screenshot planning (JSX/TSX/CSS only, larger budget) */
  uiDiff?: string;
  /** Language code for generated content (e.g. "ru", "en") — AI writes in this language */
  language?: string;
  /** Base screenshot options (device, dark mode, hide selectors, delay) */
  screenshotDefaults?: Partial<ScreenshotOptions>;
  /** Authentication options for accessing protected apps */
  auth?: AuthOptions;
  /** Called with status updates for UI progress */
  onStatus?: (phase: AgentPhase, detail: string) => void;
  /** Max screenshots to capture (default: 4) */
  maxScreenshots?: number;
  /** Custom system prompt to override the built-in defaults */
  systemPrompt?: string;
  /**
   * Called when the content plan is ready for user review.
   * Return { action: "continue" } to proceed as-is.
   * Return { action: "revise", feedback: "..." } to re-run analysis with feedback.
   * Return { action: "abort" } to stop the agent loop.
   */
  onPlanReady?: (plan: ContentPlan) => Promise<{ action: "continue" | "revise" | "abort"; feedback?: string }>;
  /**
   * Called when the screenshot plan is ready for user review.
   * Return the (possibly edited) list of screenshot instructions to proceed,
   * or null/undefined to abort.
   */
  onScreenshotPlanReady?: (plan: ScreenshotPlan) => Promise<ScreenshotPlan | null>;
}

export type AgentPhase = "analyzing" | "planning" | "screenshotting" | "composing" | "done";

export interface AgentLoopResult {
  texts: Map<string, string>;
  /** Per-platform titles (for blog/medium articles) */
  titles: Map<string, string>;
  screenshots: CapturedScreenshot[];
  /** Per-platform screenshot indices (which screenshots to attach) */
  selectedScreenshots: Map<string, number[]>;
  /** Thread posts per platform (Bluesky thread mode) */
  threads: Map<string, import("../adapters/types.js").ThreadPost[]>;
  plan: ScreenshotPlan;
  /** Content plan from the analysis phase */
  contentPlan?: ContentPlan;
}

// ── Prompt Builders ────────────────────────────────────────────────────

interface PlatformConstraint {
  key: string;
  name: string;
  maxTextLength: number;
  supportsImages: boolean;
  supportsMarkdown: boolean;
  supportsHtml: boolean;
}

function buildAnalysisPrompt(
  ctx: AnnounceContext,
  appUrl: string,
  diff?: string,
  systemPrompt?: string,
  revisionFeedback?: string,
  uiDiff?: string,
): { system: string; user: string } {
  const system = resolveSystemPrompt(DEFAULT_ANALYSIS_SYSTEM_PROMPT, undefined, systemPrompt);

  const parts: string[] = [];
  parts.push("Analyze the following software update and create a content plan for social media announcements.\n");

  parts.push(`## App URL\n${appUrl}`);
  parts.push(`## Project: ${ctx.projectName}${ctx.version ? ` ${ctx.version}` : ""}`);

  if (ctx.description) {
    parts.push(`\n## Description\n${ctx.description}`);
  }

  if (ctx.changelog) {
    parts.push(`\n## Changes`);
    if (ctx.changelog.features.length > 0) {
      parts.push("Features:\n" + ctx.changelog.features.map((c) => `- ${c.subject}${c.body ? ` — ${c.body.split("\n")[0]}` : ""}`).join("\n"));
    }
    if (ctx.changelog.fixes.length > 0) {
      parts.push("Bug fixes:\n" + ctx.changelog.fixes.map((c) => `- ${c.subject}`).join("\n"));
    }
    if (ctx.changelog.other.length > 0) {
      parts.push("Other:\n" + ctx.changelog.other.map((c) => `- ${c.subject}`).join("\n"));
    }
    parts.push(`Summary: ${ctx.changelog.summary}`);
  }

  // Prefer uiDiff (UI files only) over generic diff for analysis context
  const analysisDiff = uiDiff || diff;
  if (analysisDiff) {
    parts.push(`\n## UI Code Diff\nChanged UI files — scan for route paths, component names, CSS classes and IDs.\n${analysisDiff.slice(0, 5000)}`);
  }

  if (revisionFeedback) {
    parts.push(`\n## User Feedback on Previous Plan`);
    parts.push(`The user reviewed your previous plan and wants these adjustments:`);
    parts.push(revisionFeedback);
    parts.push(`\nRevise the plan to incorporate this feedback.`);
  }

  parts.push(`\n## Instructions`);
  parts.push(`Analyze these changes and create a content plan. Think like a user, not an engineer:\n`);
  parts.push(`1. KEY CHANGES (user perspective):`);
  parts.push(`   - What would a non-technical user NOTICE when using this app?`);
  parts.push(`   - Focus ONLY on visible UI/UX changes. Ignore refactors, dependency updates, architecture changes.`);
  parts.push(`   - Express each change as "Before, users had to X. Now, they can Y."`);
  parts.push(`   - Example good: "Search results now appear instantly as you type."`);
  parts.push(`   - Example bad: "Refactored the search API endpoint for performance."`);
  parts.push(`\n2. NARRATIVE ANGLE (the story):`);
  parts.push(`   - What is the ONE core idea that ties these changes together?`);
  parts.push(`   - Write it as a short story: "This update is about X. It solves the problem of Y for users who Z."`);
  parts.push(`   - Make it something a non-developer would find exciting or valuable.`);
  parts.push(`   - Example good: "Search just got instant — no more waiting, results appear as you type."`);
  parts.push(`   - Example bad: "Refactored the search API endpoint and added webhook integration."`);
  parts.push(`\n3. TARGET AUDIENCE:`);
  parts.push(`   - Who benefits most? (e.g., "Users who search frequently", not "developers using the REST API")`);
  parts.push(`   - What do they care about? (Speed? Ease of use? New capabilities?)`);
  parts.push(`\n4. SCREENSHOT STRATEGY (required — extract route paths and selectors from the UI diff above):`);
  parts.push(`   - For Next.js: map the changed file path to the route. app/[lang]/cashback-settings/page.tsx → /{lang}/cashback-settings`);
  parts.push(`   - Note whether the app uses a language prefix (e.g. /en/) based on the file paths in the diff.`);
  parts.push(`   - List 2-4 pages with their EXACT route paths (not guesses). Include CSS selectors from the diff for changed elements.`);
  parts.push(`   - Format: "Route: /en/cashback-settings — Selector: #cashback-triggers — Shows: new cashback trigger panel"`);
  parts.push(`   - NEVER add /dashboard/ or other prefixes that don't appear in the file paths.`);
  parts.push(`   - If no diff is available, list the most logical routes based on the commit messages.`);
  parts.push(`\n5. SUGGESTED TONE:`);
  parts.push(`   - Does this update warrant excitement, professionalism, or something else?`);

  parts.push(`\n## Output Format`);
  parts.push(`Return ONLY valid JSON, no markdown fences:`);
  parts.push(`{`);
  parts.push(`  "keyChanges": ["change 1 in plain language", "change 2", ...],`);
  parts.push(`  "narrativeAngle": "the story/angle for the announcement",`);
  parts.push(`  "targetAudience": "who cares about this and why",`);
  parts.push(`  "screenshotStrategy": "2-4 routes extracted from the diff file paths, e.g. '/en/cashback-settings showing #cashback-triggers; /en/storefront-settings?tab=recommendations showing .rec-card'",`);
  parts.push(`  "suggestedTone": "tone observations for this update"`);
  parts.push(`}`);

  return { system, user: parts.join("\n") };
}

function buildPlanPrompt(
  ctx: AnnounceContext,
  appUrl: string,
  diff?: string,
  contentPlan?: ContentPlan,
  systemPrompt?: string,
  uiDiff?: string,
): { system: string; user: string } {
  const system = resolveSystemPrompt(DEFAULT_PLAN_SYSTEM_PROMPT, undefined, systemPrompt);

  const parts: string[] = [];

  parts.push("Decide what screenshots to take from the running app for a social media announcement.\n");

  parts.push(`## App URL\n${appUrl}`);
  parts.push(`## Project: ${ctx.projectName}${ctx.version ? ` ${ctx.version}` : ""}`);

  if (contentPlan) {
    parts.push(`\n## Content Plan (from analysis phase)`);
    parts.push(`Key changes: ${contentPlan.keyChanges.join("; ")}`);
    parts.push(`Narrative angle: ${contentPlan.narrativeAngle}`);
    parts.push(`Target audience: ${contentPlan.targetAudience}`);
    parts.push(`Screenshot strategy: ${contentPlan.screenshotStrategy}`);
  }

  if (ctx.description) {
    parts.push(`\n## Description\n${ctx.description}`);
  }

  if (ctx.changelog) {
    parts.push(`\n## Changes`);
    if (ctx.changelog.features.length > 0) {
      parts.push("Features:\n" + ctx.changelog.features.map((c) => `- ${c.subject}${c.body ? ` — ${c.body.split("\n")[0]}` : ""}`).join("\n"));
    }
    if (ctx.changelog.fixes.length > 0) {
      parts.push("Bug fixes:\n" + ctx.changelog.fixes.map((c) => `- ${c.subject}`).join("\n"));
    }
    if (ctx.changelog.other.length > 0) {
      parts.push("Other:\n" + ctx.changelog.other.map((c) => `- ${c.subject}`).join("\n"));
    }
    parts.push(`Summary: ${ctx.changelog.summary}`);
  }

  // Prefer uiDiff (UI-only, larger budget) over generic diff for planning
  const planDiff = uiDiff || diff;
  if (planDiff) {
    parts.push(`\n## UI Code Diff\nThis is the actual changed UI code. Read it carefully to find real routes, element IDs, and CSS selectors.\n${planDiff}`);
  }

  parts.push(`\n## Instructions`);
  parts.push(`CRITICAL: You must derive every URL and CSS selector from the actual code diff above. DO NOT guess, invent, or assume paths.\n`);
  parts.push(`STEP 1 — Extract route paths from the diff (REQUIRED before anything else):`);
  parts.push(`Look for evidence of the actual URL paths in the diff. For Next.js apps, the file path IS the route:`);
  parts.push(`  app/[lang]/cashback-settings/page.tsx → route is /{lang}/cashback-settings`);
  parts.push(`  app/[lang]/storefront-settings/page.tsx → route is /{lang}/storefront-settings`);
  parts.push(`  pages/settings/cashback.tsx → route is /settings/cashback`);
  parts.push(`Also look for: href="...", <Link to="...">, navigate("..."), router.push("..."), path: "..." in route configs.`);
  parts.push(`If the app uses a language prefix (like /en/), check the App URL to confirm the prefix, then apply it.`);
  parts.push(`\nSTEP 2 — Extract real CSS selectors from the diff:`);
  parts.push(`Look for: id="...", className="...", data-testid="...", aria-label="..." on changed elements.`);
  parts.push(`Use those EXACT values as selectors. id="cashback-triggers" → selector "#cashback-triggers".`);
  parts.push(`\nSTEP 3 — Map routes to full URLs:`);
  parts.push(`App base URL: ${appUrl}`);
  parts.push(`Combine base URL + extracted route path. Examples:`);
  parts.push(`  Base: http://localhost:3001, Route: /en/cashback-settings → Full URL: http://localhost:3001/en/cashback-settings`);
  parts.push(`  Base: http://localhost:3001, Route: /en/storefront-settings → Full URL: http://localhost:3001/en/storefront-settings`);
  parts.push(`DO NOT add /dashboard/ or any other prefix that was not in the extracted route path.`);
  parts.push(`\nSTEP 4 — Choose capture mode per screenshot:`);
  parts.push(`ALWAYS use "highlight" to mark changed elements. NEVER use "selector" to crop/zoom.`);
  parts.push(`The goal is to show the full page with a visible colored border drawn around the changed element.`);
  parts.push(`This gives viewers full context while making the important part obvious.`);
  parts.push(`- Changed element, new section, or new panel → use "highlight" with the element's CSS selector`);
  parts.push(`- Entirely new page (nothing specific to highlight) → omit both selector and highlight for full viewport`);
  parts.push(`- Feature inside tab/accordion → add "clicks" array to reveal the content first, then "highlight" the revealed element`);
  parts.push(`- DO NOT use "selector" field at all — it crops the screenshot and loses context`);
  parts.push(`\nDescriptions must be SPECIFIC — the compose AI uses them to write the post:`);
  parts.push(`- Bad: "The settings page"`);
  parts.push(`- Good: "The cashback settings page at /en/cashback-settings showing the new trigger configuration panel"`);
  parts.push(`\nReturn 1-4 screenshot instructions. Each must have:`);
  parts.push(`- "url": Full URL constructed from base URL + route extracted from the diff`);
  parts.push(`- "clicks": Array of CSS selectors to click to reveal hidden content (omit if not needed)`);
  parts.push(`- "highlight": Array of CSS selectors to draw a colored border around (use for changed/new elements)`);
  parts.push(`- "description": What this screenshot shows and the exact URL you're navigating to`);

  parts.push(`\n## Output Format`);
  parts.push(`Return ONLY valid JSON, no markdown fences:`);
  parts.push(`{"reasoning": "why these screenshots", "screenshots": [{"url": "...", "clicks": ["..."], "highlight": ["..."], "description": "..."}]}`);

  return { system, user: parts.join("\n") };
}

function buildComposePrompt(
  ctx: AnnounceContext,
  platforms: PlatformConstraint[],
  screenshots: CapturedScreenshot[],
  verbosity?: Verbosity,
  diff?: string,
  contentPlan?: ContentPlan,
  systemPrompt?: string,
  language?: string,
  perPlatformLanguage?: Record<string, string>,
): { system: string; userContent: Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }> } {
  const system = resolveSystemPrompt(DEFAULT_COMPOSE_SYSTEM_PROMPT, undefined, systemPrompt);

  const contentParts: Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }> = [];

  // Text context
  const textParts: string[] = [];
  const languageInstruction = language
    ? ` Write ALL post content in ${language} language (ISO 639-1 code: "${language}"). Do not write in any other language.`
    : "";
  textParts.push(`Write social media posts for the following software update. You have screenshots of the actual app.${languageInstruction}\n`);

  textParts.push(`## Project`);
  textParts.push(`Name: ${ctx.projectName}`);
  if (ctx.version) textParts.push(`Version: ${ctx.version}`);
  if (ctx.url) {
    textParts.push(`URL: ${ctx.url}`);
    textParts.push(`IMPORTANT: Every post MUST end with a link to this URL. Use the exact URL above — do not invent or modify it. For Telegram use an HTML <a href="${ctx.url}"> tag. For Bluesky/X/Mastodon append it as plain text at the end. For blog/Medium embed it as a markdown link.`);
  }

  if (ctx.description) {
    textParts.push(`\n## Description\n${ctx.description}`);
  }

  if (ctx.changelog) {
    textParts.push(`\n## Changes`);
    if (ctx.changelog.features.length > 0) {
      textParts.push("Features:\n" + ctx.changelog.features.map((c) => `- ${c.subject}`).join("\n"));
    }
    if (ctx.changelog.fixes.length > 0) {
      textParts.push("Bug fixes:\n" + ctx.changelog.fixes.map((c) => `- ${c.subject}`).join("\n"));
    }
    textParts.push(`Summary: ${ctx.changelog.summary}`);
  }

  if (diff) {
    textParts.push(`\n## Diff Context (abbreviated)\n${diff.slice(0, 2000)}`);
  }

  if (contentPlan) {
    textParts.push(`\n## Content Plan (FOLLOW THIS)`);
    textParts.push(`You MUST follow this content plan. It was approved by the user.`);
    textParts.push(`Key changes to cover: ${contentPlan.keyChanges.join("; ")}`);
    textParts.push(`Narrative angle to use: ${contentPlan.narrativeAngle}`);
    textParts.push(`Target audience: ${contentPlan.targetAudience}`);
    textParts.push(`Do not introduce angles, features, or stories not listed in the key changes above.`);
  }

  textParts.push(`\n## Tone\n${ctx.tone}`);

  if (verbosity) {
    textParts.push(`\n## Verbosity\n${verbosity}`);
  }

  if (ctx.postStyle && ctx.postStyle !== "auto") {
    textParts.push(`\n## Post Structure`);
    if (ctx.postStyle === "single-narrative") {
      textParts.push(`Write ONE cohesive story that ties all changes together. Do NOT list features separately as bullet points. Weave all changes into a single narrative arc with a clear beginning, middle, and end. The reader should feel like they're hearing about one meaningful improvement, not a changelog.`);
    } else if (ctx.postStyle === "feature-list") {
      textParts.push(`Structure the post as a list of distinct updates — one dedicated section or bullet per feature/commit. Each change gets its own paragraph or bullet point. Make it easy to skim: users should be able to jump to the feature they care about.`);
    }
  }

  // Describe each screenshot
  textParts.push(`\n## Screenshots`);
  textParts.push(`${screenshots.length} screenshot(s) are attached below. Here's what each one shows:`);
  screenshots.forEach((s, i) => {
    textParts.push(`\nScreenshot ${i + 1}: ${s.instruction.description}`);
  });

  contentParts.push({ type: "text", text: textParts.join("\n") });

  // Add screenshot images
  for (const s of screenshots) {
    contentParts.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: s.buffer.toString("base64"),
      },
    });
  }

  // Platform instructions with rich per-platform formatting rules
  const platformParts: string[] = [];
  platformParts.push(`\n## Target Platforms`);
  platformParts.push("Generate a post for EACH platform. Reference the screenshots naturally — describe what's visible. Respect character limits.\n");
  platformParts.push(buildPlatformInstructions(platforms));

  platformParts.push(`\n## Screenshot Selection`);
  platformParts.push(`For each platform, also pick which screenshot(s) to attach (by index, 0-based).`);
  platformParts.push(`Platforms that don't support images should get an empty array.`);
  platformParts.push(`For short-form platforms (X, Bluesky, Mastodon): pick 1 most impactful screenshot.`);
  platformParts.push(`For Telegram: pick 1 main screenshot that best represents the update.`);
  platformParts.push(`For long-form platforms (Medium, Blog): pick multiple screenshots to place contextually within the article.`);

  platformParts.push(`\n## Screenshot-to-Paragraph Mapping (Blog/Medium Only)`);
  platformParts.push(`You have ${screenshots.length} screenshot(s), indexed 0 through ${screenshots.length - 1}.`);
  platformParts.push(`Match each screenshot to the paragraph it illustrates:`);
  screenshots.forEach((s, i) => {
    platformParts.push(`  ./image-${i}.png — ${s.instruction.description}`);
  });
  platformParts.push(`\nFor blog and medium posts, embed screenshots INLINE as you write:`);
  platformParts.push(`1. Write a paragraph about a user-facing change.`);
  platformParts.push(`2. Ask: which screenshot above shows what I just described?`);
  platformParts.push(`3. If there's a match, embed it immediately after: ![brief description of what users see](./image-N.png)`);
  platformParts.push(`4. If no screenshot matches, do NOT force an image — just move on.`);
  platformParts.push(`5. Distribute images throughout — never pile them all at the top or bottom.`);
  platformParts.push(`\nCRITICAL — image path rules:`);
  platformParts.push(`- ONLY valid paths: ./image-0.png through ./image-${screenshots.length - 1}.png`);
  platformParts.push(`- NEVER invent URLs: no https://, no /images/feature.png, no made-up paths.`);
  platformParts.push(`- NEVER reference an index beyond ${screenshots.length - 1}.`);

  // Per-platform language overrides (when platforms have different configured languages)
  if (perPlatformLanguage && Object.keys(perPlatformLanguage).length > 0 && !language) {
    platformParts.push(`\n## Per-Platform Language`);
    platformParts.push(`Write each platform's post in its specified language:`);
    for (const [key, lang] of Object.entries(perPlatformLanguage)) {
      platformParts.push(`- ${key}: write in ${lang} language (ISO 639-1: "${lang}")`);
    }
  }

  platformParts.push(`\n## Title Requirement (Blog/Medium Only)`);
  platformParts.push(`The title must:`);
  platformParts.push(`1. Reflect the narrative angle — if the story is about speed, the title is about speed.`);
  platformParts.push(`2. Lead with USER BENEFIT, not feature names.`);
  platformParts.push(`   Bad: "New Search API Improvements". Good: "Search Results Now Appear Instantly".`);
  platformParts.push(`3. Be specific to THIS update — not "Product Updates" or "New Features Released".`);
  platformParts.push(`4. Keep under 100 characters.`);

  const hasBluesky = platforms.some((p) => p.key === "bluesky");
  const keys = platforms.map((p) => {
    const isLongForm = p.key === "blog" || p.key === "medium" || p.key === "devto";
    if (p.key === "bluesky") {
      return `"bluesky": {"thread": [{"text": "hook post...", "imageIndex": 0}, {"text": "feature 1...", "imageIndex": 1}], "screenshots": [0, 1]}`;
    }
    return isLongForm
      ? `"${p.key}": {"title": "...", "text": "...", "screenshots": [0, 1]}`
      : `"${p.key}": {"text": "...", "screenshots": [0]}`;
  }).join(", ");

  platformParts.push(`\n## Output Format`);
  platformParts.push(`Return ONLY valid JSON, no markdown fences:`);
  platformParts.push(`{${keys}}`);

  if (hasBluesky) {
    platformParts.push(`\n## Bluesky Thread Format`);
    platformParts.push(`For Bluesky, output a "thread" array instead of a single "text" field.`);
    platformParts.push(`Each item in the thread array is one post: {"text": "...", "imageIndex": N}`);
    platformParts.push(`- "text": the post text, max 280 characters`);
    platformParts.push(`- "imageIndex": index of the screenshot to attach (0-based), or omit if no image`);
    platformParts.push(`When there are 2+ features or 2+ screenshots: use thread format (one post per feature).`);
    platformParts.push(`When there is only 1 feature or no screenshots: "thread" array with a single item is fine.`);
    platformParts.push(`The "screenshots" field on the Bluesky entry should list all screenshot indices used across the thread.`);
  }

  contentParts.push({ type: "text", text: platformParts.join("\n") });

  return { system, userContent: contentParts };
}

// ── AI Callers ─────────────────────────────────────────────────────────

async function callAnthropicPlan(
  prompt: { system: string; user: string },
  options: AiGenerateOptions,
): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: options.apiKey });
  const response = await client.messages.create({
    model: options.model ?? "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

async function callAnthropicCompose(
  prompt: ReturnType<typeof buildComposePrompt>,
  options: AiGenerateOptions,
): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: options.apiKey });
  const response = await client.messages.create({
    model: options.model ?? "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: prompt.system,
    messages: [{
      role: "user",
      content: prompt.userContent as Array<
        | { type: "text"; text: string }
        | { type: "image"; source: { type: "base64"; media_type: "image/png"; data: string } }
      >,
    }],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

async function callOpenAIPlan(
  prompt: { system: string; user: string },
  options: AiGenerateOptions,
): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: options.apiKey });
  const response = await client.chat.completions.create({
    model: options.model ?? "gpt-4o",
    max_tokens: 2048,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
  });
  return response.choices[0]?.message?.content ?? "";
}

async function callOpenAICompose(
  prompt: ReturnType<typeof buildComposePrompt>,
  options: AiGenerateOptions,
): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: options.apiKey });

  // Convert content blocks to OpenAI format
  const contentParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
  for (const part of prompt.userContent) {
    if (part.type === "text") {
      contentParts.push({ type: "text", text: part.text });
    } else if (part.type === "image") {
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:${part.source.media_type};base64,${part.source.data}` },
      });
    }
  }

  const response = await client.chat.completions.create({
    model: options.model ?? "gpt-4o",
    max_tokens: 8192,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: contentParts },
    ],
  });
  return response.choices[0]?.message?.content ?? "";
}

// ── JSON Parsers ───────────────────────────────────────────────────────

function cleanJson(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return cleaned;
}

function parsePlanResponse(raw: string): ScreenshotPlan | null {
  try {
    const parsed = JSON.parse(cleanJson(raw));
    if (!Array.isArray(parsed.screenshots)) return null;

    const screenshots: ScreenshotInstruction[] = [];
    for (const s of parsed.screenshots) {
      if (typeof s.url !== "string" || typeof s.description !== "string") continue;
      screenshots.push({
        url: s.url,
        selector: typeof s.selector === "string" ? s.selector : undefined,
        highlight: Array.isArray(s.highlight) ? s.highlight.filter((h: unknown) => typeof h === "string") : undefined,
        clicks: Array.isArray(s.clicks) ? s.clicks.filter((c: unknown) => typeof c === "string") : undefined,
        description: s.description,
      });
    }

    if (screenshots.length === 0) return null;

    return {
      screenshots,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch {
    return null;
  }
}

function parseComposeResponse(
  raw: string,
  platformKeys: string[],
): { texts: Map<string, string>; titles: Map<string, string>; selectedScreenshots: Map<string, number[]>; threads: Map<string, import("../adapters/types.js").ThreadPost[]> } | null {
  try {
    const parsed = JSON.parse(cleanJson(raw));
    const texts = new Map<string, string>();
    const titles = new Map<string, string>();
    const selectedScreenshots = new Map<string, number[]>();
    const threads = new Map<string, import("../adapters/types.js").ThreadPost[]>();

    for (const key of platformKeys) {
      const entry = parsed[key];
      if (!entry) continue;

      // Support both { text, screenshots, title } and plain string
      if (typeof entry === "string") {
        texts.set(key, entry);
        selectedScreenshots.set(key, [0]);
      } else if (typeof entry === "object") {
        // Bluesky thread format: { thread: [{text, imageIndex}, ...], screenshots: [...] }
        if (Array.isArray(entry.thread) && entry.thread.length > 0) {
          const threadPosts = entry.thread
            .filter((t: unknown) => typeof (t as any)?.text === "string")
            .map((t: any) => ({
              text: t.text as string,
              imageIndex: typeof t.imageIndex === "number" ? t.imageIndex : undefined,
            }));
          if (threadPosts.length > 0) {
            threads.set(key, threadPosts);
            // Store the root post text for display in the editor
            texts.set(key, threadPosts.map((t: import("../adapters/types.js").ThreadPost) => t.text).join("\n\n---\n\n"));
          }
        } else if (typeof entry.text === "string" && entry.text.length > 0) {
          texts.set(key, entry.text);
        }

        if (typeof entry.title === "string" && entry.title.length > 0) {
          titles.set(key, entry.title);
        }
        if (Array.isArray(entry.screenshots)) {
          selectedScreenshots.set(
            key,
            entry.screenshots.filter((i: unknown) => typeof i === "number"),
          );
        }
      }
    }

    if (texts.size === 0) return null;
    return { texts, titles, selectedScreenshots, threads };
  } catch {
    return null;
  }
}

// ── Analysis Parser ─────────────────────────────────────────────────────

function parseAnalysisResponse(raw: string): ContentPlan | null {
  try {
    const parsed = JSON.parse(cleanJson(raw));
    if (!Array.isArray(parsed.keyChanges) || typeof parsed.narrativeAngle !== "string") return null;
    return {
      keyChanges: parsed.keyChanges.filter((c: unknown) => typeof c === "string"),
      narrativeAngle: parsed.narrativeAngle,
      targetAudience: typeof parsed.targetAudience === "string" ? parsed.targetAudience : "",
      screenshotStrategy: typeof parsed.screenshotStrategy === "string" ? parsed.screenshotStrategy : "",
      suggestedTone: typeof parsed.suggestedTone === "string" ? parsed.suggestedTone : "",
    };
  } catch {
    return null;
  }
}

// ── Main Loop ──────────────────────────────────────────────────────────

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const { aiOptions, context, appUrl, adapters, verbosity, diff, uiDiff, onStatus } = options;
  const maxScreenshots = options.maxScreenshots ?? 4;

  const emit = (phase: AgentPhase, detail: string) => {
    if (onStatus) onStatus(phase, detail);
  };

  // ── Pass 0: Analyze changes and create content plan ─────────────────
  // Supports revision loop: user can provide feedback to adjust the plan.

  let contentPlan: ContentPlan | null = null;
  let revisionFeedback: string | undefined;
  const MAX_REVISIONS = 3;

  for (let revision = 0; revision <= MAX_REVISIONS; revision++) {
    emit("analyzing", revision === 0
      ? "AI is analyzing changes and creating a content plan..."
      : `AI is revising the content plan (revision ${revision})...`);

    const analysisPrompt = buildAnalysisPrompt(context, appUrl, diff, options.systemPrompt, revisionFeedback, uiDiff);
    let analysisRaw: string;

    if (aiOptions.provider === "openai") {
      analysisRaw = await callOpenAIPlan(analysisPrompt, aiOptions);
    } else {
      analysisRaw = await callAnthropicPlan(analysisPrompt, aiOptions);
    }

    contentPlan = parseAnalysisResponse(analysisRaw);

    if (!contentPlan) {
      emit("analyzing", "Could not parse content plan, proceeding with screenshot planning...");
      break;
    }

    emit("analyzing", `Content plan: ${contentPlan.narrativeAngle}`);

    // Allow caller to review and potentially revise or abort
    if (options.onPlanReady) {
      const result = await options.onPlanReady(contentPlan);
      if (result.action === "abort") {
        throw new Error("Content plan rejected by user.");
      }
      if (result.action === "revise" && result.feedback) {
        revisionFeedback = result.feedback;
        continue; // Re-run analysis with feedback
      }
    }

    break; // Plan accepted
  }

  // ── Pass 1: Plan screenshots ───────────────────────────────────────

  emit("planning", "AI is planning screenshots...");

  const planPrompt = buildPlanPrompt(context, appUrl, diff, contentPlan ?? undefined, options.systemPrompt, uiDiff);
  let planRaw: string;

  if (aiOptions.provider === "openai") {
    planRaw = await callOpenAIPlan(planPrompt, aiOptions);
  } else {
    planRaw = await callAnthropicPlan(planPrompt, aiOptions);
  }

  const plan = parsePlanResponse(planRaw);
  if (!plan || plan.screenshots.length === 0) {
    throw new Error("AI failed to produce a screenshot plan. Raw response:\n" + planRaw.slice(0, 500));
  }

  // Cap screenshots
  plan.screenshots = plan.screenshots.slice(0, maxScreenshots);

  emit("planning", `AI planned ${plan.screenshots.length} screenshot(s): ${plan.reasoning.slice(0, 100)}`);

  // Allow caller to review and edit the screenshot plan before execution
  let finalPlan = plan;
  if (options.onScreenshotPlanReady) {
    const reviewed = await options.onScreenshotPlanReady(plan);
    if (!reviewed) {
      throw new Error("Screenshot plan rejected by user.");
    }
    finalPlan = reviewed;
    emit("planning", `Screenshot plan confirmed: ${finalPlan.screenshots.length} screenshot(s)`);
  }

  // ── Execute: Capture screenshots ───────────────────────────────────
  // Uses a single BrowserSession so headed mode shows one persistent window
  // that navigates between pages (instead of opening/closing per screenshot).

  emit("screenshotting", `Capturing ${finalPlan.screenshots.length} screenshot(s)...`);

  const { BrowserSession } = await import("../screenshot/capture.js");
  const captured: CapturedScreenshot[] = [];
  const captureErrors: string[] = [];

  const session = new BrowserSession({
    ...options.screenshotDefaults,
    auth: options.auth,
  });

  try {
    try {
      await session.init();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = msg.includes("Executable doesn't exist") || msg.includes("playwright")
        ? "Playwright browser not found. Run: bunx playwright install chromium"
        : msg;
      throw new Error(`Failed to launch browser: ${hint}`);
    }

    for (let i = 0; i < finalPlan.screenshots.length; i++) {
      const instruction = finalPlan.screenshots[i];
      emit("screenshotting", `[${i + 1}/${finalPlan.screenshots.length}] ${instruction.description}`);

      try {
        // Per-screenshot timeout (45s) so one stuck page doesn't block the whole loop
        const SCREENSHOT_TIMEOUT = 45_000;
        const result = await Promise.race([
          session.capture({
            url: instruction.url,
            selector: instruction.selector,
            highlight: instruction.highlight,
            clicks: instruction.clicks,
            hide: options.screenshotDefaults?.hide,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Screenshot timed out after ${SCREENSHOT_TIMEOUT / 1000}s`)), SCREENSHOT_TIMEOUT),
          ),
        ]);
        captured.push({
          instruction,
          buffer: result.buffer,
          width: result.width,
          height: result.height,
        });
      } catch (err) {
        // Skip failed/timed-out screenshots but continue with others
        const errMsg = err instanceof Error ? err.message : String(err);
        captureErrors.push(`[${i + 1}] ${instruction.url} — ${errMsg}`);
        emit("screenshotting", `⚠ Screenshot ${i + 1} failed: ${errMsg}`);
      }
    }
  } finally {
    await session.close();
  }

  if (captured.length === 0) {
    const errorDetail = captureErrors.join("\n");
    throw new Error(
      `All ${finalPlan.screenshots.length} screenshot(s) failed.\n\n` +
      `Errors:\n${errorDetail}\n\n` +
      `This usually means the AI guessed the wrong URL paths. ` +
      `Please review the screenshot plan above and correct the URLs before retrying.`
    );
  }

  // Warn if some screenshots failed but others succeeded
  if (captureErrors.length > 0) {
    emit("screenshotting", `⚠ ${captureErrors.length} screenshot(s) failed, proceeding with ${captured.length} captured:\n${captureErrors.join("\n")}`);
  }

  emit("screenshotting", `Captured ${captured.length} screenshot(s)`);

  // ── Pass 2: Compose posts with vision ──────────────────────────────

  emit("composing", "AI is viewing screenshots and writing posts...");

  const platforms: PlatformConstraint[] = Array.from(adapters.entries()).map(([key, adapter]) => ({
    key,
    name: adapter.name,
    maxTextLength: adapter.maxTextLength,
    supportsImages: adapter.supportsImages,
    supportsMarkdown: adapter.supportsMarkdown,
    supportsHtml: adapter.supportsHtml,
  }));

  const perPlatformLanguage: Record<string, string> = {};
  if (!options.language) {
    for (const [key, adapter] of adapters) {
      if (adapter.language) perPlatformLanguage[key] = adapter.language;
    }
  }

  const composePrompt = buildComposePrompt(
    context, platforms, captured, verbosity, diff, contentPlan ?? undefined,
    options.systemPrompt, options.language,
    Object.keys(perPlatformLanguage).length > 0 ? perPlatformLanguage : undefined,
  );
  let composeRaw: string;

  if (aiOptions.provider === "openai") {
    composeRaw = await callOpenAICompose(composePrompt, aiOptions);
  } else {
    composeRaw = await callAnthropicCompose(composePrompt, aiOptions);
  }

  const platformKeys = Array.from(adapters.keys());
  const composed = parseComposeResponse(composeRaw, platformKeys);
  if (!composed) {
    throw new Error("AI failed to compose posts from screenshots. Raw response:\n" + composeRaw.slice(0, 500));
  }


  // Validate screenshot indices
  for (const [key, indices] of composed.selectedScreenshots) {
    composed.selectedScreenshots.set(
      key,
      indices.filter((i) => i >= 0 && i < captured.length),
    );
  }

  // Safety: truncate non-thread texts exceeding platform limits
  for (const [key, adapter] of adapters) {
    if (composed.threads.has(key)) continue;
    const text = composed.texts.get(key);
    if (text && text.length > adapter.maxTextLength) {
      composed.texts.set(key, text.slice(0, adapter.maxTextLength - 3) + "...");
    }
  }

  emit("done", `Generated posts for ${composed.texts.size} platform(s) with ${captured.length} screenshot(s)`);

  return {
    texts: composed.texts,
    titles: composed.titles,
    screenshots: captured,
    selectedScreenshots: composed.selectedScreenshots,
    threads: composed.threads,
    plan: finalPlan,
    contentPlan: contentPlan ?? undefined,
  };
}

/**
 * Re-compose content with user revision feedback, reusing existing screenshots.
 */
export async function reviseAgentContent(options: {
  aiOptions: AiGenerateOptions;
  context: AnnounceContext;
  adapters: Map<string, Adapter>;
  agentResult: AgentLoopResult;
  feedback: string;
  verbosity?: Verbosity;
  diff?: string;
  systemPrompt?: string;
  language?: string;
}): Promise<{ texts: Map<string, string>; titles: Map<string, string>; selectedScreenshots: Map<string, number[]>; threads: Map<string, import("../adapters/types.js").ThreadPost[]> }> {
  const { aiOptions, context, adapters, agentResult, feedback, verbosity, diff, systemPrompt } = options;

  const platforms: PlatformConstraint[] = Array.from(adapters.entries()).map(([key, adapter]) => ({
    key,
    name: adapter.name,
    maxTextLength: adapter.maxTextLength,
    supportsImages: adapter.supportsImages,
    supportsMarkdown: adapter.supportsMarkdown,
    supportsHtml: adapter.supportsHtml,
  }));

  const perPlatformLanguage: Record<string, string> = {};
  if (!options.language) {
    for (const [key, adapter] of adapters) {
      if (adapter.language) perPlatformLanguage[key] = adapter.language;
    }
  }

  const composePrompt = buildComposePrompt(
    context, platforms, agentResult.screenshots, verbosity, diff,
    agentResult.contentPlan ?? undefined, systemPrompt, options.language,
    Object.keys(perPlatformLanguage).length > 0 ? perPlatformLanguage : undefined,
  );

  // Append revision feedback to the last text content part
  const revisionBlock = `\n\n## Revision Request\nThe user reviewed your previous output and wants changes. Here is what you generated before:\n\n` +
    Array.from(agentResult.texts.entries()).map(([key, text]) => `### ${key}\n${text}`).join("\n\n") +
    `\n\nUser feedback: ${feedback}\n\nPlease regenerate ALL platform posts, incorporating the user's feedback.`;

  composePrompt.userContent.push({ type: "text", text: revisionBlock });

  let composeRaw: string;
  if (aiOptions.provider === "openai") {
    composeRaw = await callOpenAICompose(composePrompt, aiOptions);
  } else {
    composeRaw = await callAnthropicCompose(composePrompt, aiOptions);
  }

  const platformKeys = Array.from(adapters.keys());
  const composed = parseComposeResponse(composeRaw, platformKeys);
  if (!composed) {
    throw new Error("AI failed to revise posts. Raw response:\n" + composeRaw.slice(0, 500));
  }

  // Safety: truncate texts exceeding platform limits
  for (const [key, adapter] of adapters) {
    const text = composed.texts.get(key);
    if (text && text.length > adapter.maxTextLength) {
      composed.texts.set(key, text.slice(0, adapter.maxTextLength - 3) + "...");
    }
  }

  // Validate screenshot indices
  for (const [key, indices] of composed.selectedScreenshots) {
    composed.selectedScreenshots.set(
      key,
      indices.filter((i) => i >= 0 && i < agentResult.screenshots.length),
    );
  }

  return composed;
}

/**
 * Get the screenshots selected for a specific platform from the agent loop result.
 */
export function getScreenshotsForPlatform(
  result: AgentLoopResult,
  platformKey: string,
): Buffer[] {
  const indices = result.selectedScreenshots.get(platformKey) ?? [0];
  return indices
    .filter((i) => i >= 0 && i < result.screenshots.length)
    .map((i) => result.screenshots[i].buffer);
}
