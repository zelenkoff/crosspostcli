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
}

export type AgentPhase = "planning" | "screenshotting" | "composing" | "done";

export interface AgentLoopResult {
  texts: Map<string, string>;
  screenshots: CapturedScreenshot[];
  /** Per-platform screenshot indices (which screenshots to attach) */
  selectedScreenshots: Map<string, number[]>;
  plan: ScreenshotPlan;
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

function buildPlanPrompt(
  ctx: AnnounceContext,
  appUrl: string,
  diff?: string,
): { system: string; user: string } {
  const system =
    "You are an expert developer advocate. You analyze software changes and decide which parts of a running application " +
    "would be most visually compelling to screenshot for social media announcements. " +
    "You think about what would catch a developer's eye and make them want to try the product. " +
    "You return JSON only.";

  const parts: string[] = [];

  parts.push("Analyze the following software update and decide what screenshots to take from the running app.\n");

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
  parts.push(`Based on the changes above, decide which pages/sections of the app at ${appUrl} would make the best screenshots for a social media announcement.`);
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
): { system: string; userContent: Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }> } {
  const system =
    "You are a developer relations copywriter. You write social media announcements for software releases. " +
    "You are looking at actual screenshots of the application you're writing about. " +
    "Write posts that naturally reference what's visible in the screenshots — describe what users will see, " +
    "point out visual details, make the reader feel like they're looking at the app. " +
    "You never use hashtags unless explicitly asked. You focus on what matters to users. " +
    "You return JSON only.";

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

  // Platform instructions and output format
  const platformParts: string[] = [];
  platformParts.push(`\n## Target Platforms`);
  platformParts.push("Generate a post for EACH platform. Reference the screenshots naturally — describe what's visible. Respect character limits.\n");
  for (const p of platforms) {
    const formatting = p.supportsMarkdown ? "supports markdown" : p.supportsHtml ? "supports HTML" : "plain text only";
    const imageNote = p.supportsImages ? "images supported" : "no image support";
    platformParts.push(`- ${p.name} (key: "${p.key}"): max ${p.maxTextLength} chars, ${formatting}, ${imageNote}`);
  }

  platformParts.push(`\n## Screenshot Selection`);
  platformParts.push(`For each platform, also pick which screenshot(s) to attach (by index, 0-based).`);
  platformParts.push(`Platforms that don't support images should get an empty array.`);
  platformParts.push(`Pick the most impactful screenshot(s) — usually 1-2 is best for social media.`);

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

// ── Main Loop ──────────────────────────────────────────────────────────

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const { aiOptions, context, appUrl, adapters, verbosity, diff, onStatus } = options;
  const maxScreenshots = options.maxScreenshots ?? 4;

  const emit = (phase: AgentPhase, detail: string) => {
    if (onStatus) onStatus(phase, detail);
  };

  // ── Pass 1: Plan screenshots ───────────────────────────────────────

  emit("planning", "AI is analyzing changes and planning screenshots...");

  const planPrompt = buildPlanPrompt(context, appUrl, diff);
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

  const composePrompt = buildComposePrompt(context, platforms, captured, verbosity, diff);
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
