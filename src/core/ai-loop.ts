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
import type { ScreenshotOptions, ScreenshotResult, AuthOptions } from "../screenshot/capture.js";
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
  diff?: string;
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
  /** Called when the content plan is ready; return false to abort */
  onPlanReady?: (plan: ContentPlan) => Promise<boolean>;
}

export type AgentPhase = "analyzing" | "planning" | "screenshotting" | "composing" | "done";

export interface AgentLoopResult {
  texts: Map<string, string>;
  screenshots: CapturedScreenshot[];
  /** Per-platform screenshot indices (which screenshots to attach) */
  selectedScreenshots: Map<string, number[]>;
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

  if (diff) {
    parts.push(`\n## Code Diff (abbreviated)\n${diff.slice(0, 3000)}`);
  }

  parts.push(`\n## Instructions`);
  parts.push(`Analyze these changes and create a content plan. Think about:`);
  parts.push(`- What are the key changes in plain language? What would a user notice?`);
  parts.push(`- What's the best narrative angle for the announcement?`);
  parts.push(`- Who is the target audience? What do they care about?`);
  parts.push(`- What UI elements in the app at ${appUrl} would best illustrate these changes?`);
  parts.push(`- What tone fits this type of update?`);

  parts.push(`\n## Output Format`);
  parts.push(`Return ONLY valid JSON, no markdown fences:`);
  parts.push(`{`);
  parts.push(`  "keyChanges": ["change 1 in plain language", "change 2", ...],`);
  parts.push(`  "narrativeAngle": "the story/angle for the announcement",`);
  parts.push(`  "targetAudience": "who cares about this and why",`);
  parts.push(`  "screenshotStrategy": "what UI elements to look for and why",`);
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

  if (diff) {
    parts.push(`\n## Code Diff (abbreviated)\n${diff.slice(0, 3000)}`);
  }

  parts.push(`\n## Instructions`);
  parts.push(`Based on the analysis above, decide which pages/sections of the app at ${appUrl} would make the best screenshots.`);
  parts.push(`Think about:`);
  parts.push(`- What UI changes are most visually interesting?`);
  parts.push(`- What would make a developer stop scrolling?`);
  parts.push(`- Which pages show the new features best?`);
  parts.push(`- Should we capture the full page or a specific element?`);
  parts.push(`\nReturn 1-4 screenshot instructions. Each should have:`);
  parts.push(`- "url": The full URL to navigate to (can be the same base URL or subpages)`);
  parts.push(`- "selector": Optional CSS selector to capture a specific element (omit for full viewport)`);
  parts.push(`- "highlight": Optional array of CSS selectors to highlight with a red outline`);
  parts.push(`- "description": What this screenshot shows and why it matters`);

  parts.push(`\n## Output Format`);
  parts.push(`Return ONLY valid JSON, no markdown fences:`);
  parts.push(`{"reasoning": "why these screenshots", "screenshots": [{"url": "...", "selector": "...", "highlight": ["..."], "description": "..."}]}`);

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
): { system: string; userContent: Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }> } {
  const system = resolveSystemPrompt(DEFAULT_COMPOSE_SYSTEM_PROMPT, undefined, systemPrompt);

  const contentParts: Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }> = [];

  // Text context
  const textParts: string[] = [];
  textParts.push("Write social media posts for the following software update. You have screenshots of the actual app.\n");

  textParts.push(`## Project`);
  textParts.push(`Name: ${ctx.projectName}`);
  if (ctx.version) textParts.push(`Version: ${ctx.version}`);
  if (ctx.url) textParts.push(`URL: ${ctx.url}`);

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
    textParts.push(`\n## Content Plan (from analysis phase)`);
    textParts.push(`Key changes: ${contentPlan.keyChanges.join("; ")}`);
    textParts.push(`Narrative angle: ${contentPlan.narrativeAngle}`);
    textParts.push(`Target audience: ${contentPlan.targetAudience}`);
  }

  textParts.push(`\n## Tone\n${ctx.tone}`);

  if (verbosity) {
    textParts.push(`\n## Verbosity\n${verbosity}`);
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

  const keys = platforms.map((p) => `"${p.key}": {"text": "...", "screenshots": [0]}`).join(", ");
  platformParts.push(`\n## Output Format`);
  platformParts.push(`Return ONLY valid JSON, no markdown fences:`);
  platformParts.push(`{${keys}}`);

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
    max_tokens: 4096,
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
    max_tokens: 4096,
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
): { texts: Map<string, string>; selectedScreenshots: Map<string, number[]> } | null {
  try {
    const parsed = JSON.parse(cleanJson(raw));
    const texts = new Map<string, string>();
    const selectedScreenshots = new Map<string, number[]>();

    for (const key of platformKeys) {
      const entry = parsed[key];
      if (!entry) continue;

      // Support both { text, screenshots } and plain string
      if (typeof entry === "string") {
        texts.set(key, entry);
        selectedScreenshots.set(key, [0]);
      } else if (typeof entry === "object") {
        if (typeof entry.text === "string" && entry.text.length > 0) {
          texts.set(key, entry.text);
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
    return { texts, selectedScreenshots };
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
  const { aiOptions, context, appUrl, adapters, verbosity, diff, onStatus } = options;
  const maxScreenshots = options.maxScreenshots ?? 4;

  const emit = (phase: AgentPhase, detail: string) => {
    if (onStatus) onStatus(phase, detail);
  };

  // ── Pass 0: Analyze changes and create content plan ─────────────────

  emit("analyzing", "AI is analyzing changes and creating a content plan...");

  const analysisPrompt = buildAnalysisPrompt(context, appUrl, diff, options.systemPrompt);
  let analysisRaw: string;

  if (aiOptions.provider === "openai") {
    analysisRaw = await callOpenAIPlan(analysisPrompt, aiOptions);
  } else {
    analysisRaw = await callAnthropicPlan(analysisPrompt, aiOptions);
  }

  const contentPlan = parseAnalysisResponse(analysisRaw);

  if (contentPlan) {
    emit("analyzing", `Content plan: ${contentPlan.narrativeAngle}`);

    // Allow caller to review and potentially abort
    if (options.onPlanReady) {
      const shouldContinue = await options.onPlanReady(contentPlan);
      if (!shouldContinue) {
        throw new Error("Content plan rejected by user.");
      }
    }
  } else {
    emit("analyzing", "Could not parse content plan, proceeding with screenshot planning...");
  }

  // ── Pass 1: Plan screenshots ───────────────────────────────────────

  emit("planning", "AI is planning screenshots...");

  const planPrompt = buildPlanPrompt(context, appUrl, diff, contentPlan ?? undefined, options.systemPrompt);
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

  // ── Execute: Capture screenshots ───────────────────────────────────

  emit("screenshotting", `Capturing ${plan.screenshots.length} screenshot(s)...`);

  const { captureScreenshot } = await import("../screenshot/capture.js");
  const captured: CapturedScreenshot[] = [];

  for (let i = 0; i < plan.screenshots.length; i++) {
    const instruction = plan.screenshots[i];
    emit("screenshotting", `[${i + 1}/${plan.screenshots.length}] ${instruction.description}`);

    try {
      const captureOpts: ScreenshotOptions = {
        url: instruction.url,
        selector: instruction.selector,
        highlight: instruction.highlight,
        // Merge in defaults
        ...options.screenshotDefaults,
        // But always use the instruction's URL/selector/highlight
        ...(instruction.url ? { url: instruction.url } : {}),
        ...(instruction.selector ? { selector: instruction.selector } : {}),
        ...(instruction.highlight ? { highlight: instruction.highlight } : {}),
        // Auth is always passed through from the loop options
        auth: options.auth,
      };

      const result = await captureScreenshot(captureOpts);
      captured.push({
        instruction,
        buffer: result.buffer,
        width: result.width,
        height: result.height,
      });
    } catch (err) {
      // Skip failed screenshots but continue with others
      emit("screenshotting", `Warning: Failed to capture screenshot ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (captured.length === 0) {
    throw new Error("All screenshots failed to capture. Is the app running at " + appUrl + "?");
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

  const composePrompt = buildComposePrompt(context, platforms, captured, verbosity, diff, contentPlan ?? undefined, options.systemPrompt);
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
      indices.filter((i) => i >= 0 && i < captured.length),
    );
  }

  emit("done", `Generated posts for ${composed.texts.size} platform(s) with ${captured.length} screenshot(s)`);

  return {
    texts: composed.texts,
    screenshots: captured,
    selectedScreenshots: composed.selectedScreenshots,
    plan,
    contentPlan: contentPlan ?? undefined,
  };
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
