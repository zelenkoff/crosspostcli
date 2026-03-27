import type { Changelog } from "./changelog.js";
import type { Adapter } from "../adapters/types.js";
import type { AnnounceContext, Tone, Verbosity } from "./announce-templates.js";
import type { AiConfig } from "../config/schema.js";
import { DEFAULT_SIMPLE_SYSTEM_PROMPT, buildPlatformInstructions, resolveSystemPrompt } from "./platform-prompts.js";

export interface AiGenerateOptions {
  provider: "anthropic" | "openai";
  model?: string;
  apiKey: string;
}

interface PlatformConstraint {
  key: string;
  name: string;
  maxTextLength: number;
  supportsMarkdown: boolean;
  supportsHtml: boolean;
}

const PROVIDER_DEFAULTS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
};

function formatChangelog(changelog: Changelog): string {
  const sections: string[] = [];

  if (changelog.features.length > 0) {
    sections.push(
      "Features:\n" +
        changelog.features.map((c) => `- ${c.subject}${c.body ? ` — ${c.body.split("\n")[0]}` : ""}`).join("\n"),
    );
  }
  if (changelog.fixes.length > 0) {
    sections.push("Bug fixes:\n" + changelog.fixes.map((c) => `- ${c.subject}`).join("\n"));
  }
  if (changelog.other.length > 0) {
    sections.push("Other:\n" + changelog.other.map((c) => `- ${c.subject}`).join("\n"));
  }

  return sections.join("\n\n") || "No detailed changes available.";
}

const TONE_DESCRIPTIONS: Record<Tone, string> = {
  professional: "Formal and polished. No emoji. Third-person voice.",
  casual: "Friendly developer tone. Minimal emoji. Conversational.",
  excited: "Enthusiastic and energetic. Emoji welcome. Celebratory.",
};

function buildPrompt(
  ctx: AnnounceContext,
  platforms: PlatformConstraint[],
  verbosity?: Verbosity,
  diff?: string,
  systemPrompt?: string,
  revisionFeedback?: { previousTexts: Map<string, string>; feedback: string },
  language?: string,
  perPlatformLanguage?: Record<string, string>,
): { system: string; user: string } {
  const system = resolveSystemPrompt(DEFAULT_SIMPLE_SYSTEM_PROMPT, undefined, systemPrompt);

  const parts: string[] = [];

  // Global language instruction (when --lang is passed)
  const languageInstruction = language
    ? ` Write ALL post content in ${language} language (ISO 639-1 code: "${language}"). Do not write in any other language.`
    : "";
  parts.push(`Write social media posts for the following software update.${languageInstruction}\n`);

  parts.push(`## Project`);
  parts.push(`Name: ${ctx.projectName}`);
  if (ctx.version) parts.push(`Version: ${ctx.version}`);
  if (ctx.url) {
    parts.push(`URL: ${ctx.url}`);
    parts.push(`IMPORTANT: Every post MUST end with a link to this URL. Use the exact URL above — do not invent or modify it.`);
  }

  if (ctx.description) {
    parts.push(`\n## Description\n${ctx.description}`);
  }

  if (ctx.changelog) {
    parts.push(`\n## Changes\n${formatChangelog(ctx.changelog)}`);
    parts.push(`\nSummary: ${ctx.changelog.summary}`);
  }

  if (diff) {
    parts.push(`\n## Diff Context (abbreviated)\n${diff}`);
  }

  parts.push(`\n## Tone\n${ctx.tone} — ${TONE_DESCRIPTIONS[ctx.tone]}`);

  if (ctx.postStyle && ctx.postStyle !== "auto") {
    parts.push(`\n## Post Structure`);
    if (ctx.postStyle === "single-narrative") {
      parts.push(`Write ONE cohesive story that ties all changes together. Do NOT list features separately as bullet points. Weave all changes into a single narrative arc with a clear beginning, middle, and end. The reader should feel like they're hearing about one meaningful improvement, not a changelog.`);
    } else if (ctx.postStyle === "feature-list") {
      parts.push(`Structure the post as a list of distinct updates — one dedicated section or bullet per feature/commit. Each change gets its own paragraph or bullet point. Make it easy to skim: users should be able to jump to the feature they care about.`);
    }
  }

  if (verbosity) {
    const verbosityDesc: Record<Verbosity, string> = {
      brief: "One-liner. Just the headline.",
      normal: "A few sentences. Intro + key changes.",
      detailed: "Comprehensive. Cover all changes.",
    };
    parts.push(`\n## Verbosity\n${verbosity} — ${verbosityDesc[verbosity]}`);
  }

  parts.push(`\n## Target Platforms`);
  parts.push("Generate a post for EACH of the following platforms. Respect the character limit strictly.\n");
  parts.push(buildPlatformInstructions(platforms.map((p) => ({ ...p, supportsImages: false }))));

  // Per-platform language overrides (when platforms have different configured languages)
  if (perPlatformLanguage && Object.keys(perPlatformLanguage).length > 0 && !language) {
    parts.push(`\n## Per-Platform Language`);
    parts.push(`Write each platform's post in its specified language:`);
    for (const [key, lang] of Object.entries(perPlatformLanguage)) {
      parts.push(`- ${key}: write in ${lang} language (ISO 639-1: "${lang}")`);
    }
  }

  if (revisionFeedback) {
    parts.push(`\n## Revision Request`);
    parts.push(`The user reviewed your previous output and wants changes. Here is what you generated before:\n`);
    for (const [key, text] of revisionFeedback.previousTexts) {
      parts.push(`### ${key}\n${text}\n`);
    }
    parts.push(`User feedback: ${revisionFeedback.feedback}`);
    parts.push(`\nPlease regenerate ALL platform posts, incorporating the user's feedback.`);
  }

  const keys = platforms.map((p) => `"${p.key}": "..."`).join(", ");
  parts.push(`\n## Output Format`);
  parts.push(`Return ONLY valid JSON, no markdown fences, no extra text:`);
  parts.push(`{${keys}}`);

  return { system, user: parts.join("\n") };
}

async function callAnthropic(
  prompt: { system: string; user: string },
  options: AiGenerateOptions,
): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: options.apiKey });
  const response = await client.messages.create({
    model: options.model ?? PROVIDER_DEFAULTS.anthropic,
    max_tokens: 4096,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

async function callOpenAI(
  prompt: { system: string; user: string },
  options: AiGenerateOptions,
): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: options.apiKey });
  const response = await client.chat.completions.create({
    model: options.model ?? PROVIDER_DEFAULTS.openai,
    max_tokens: 4096,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
  });
  return response.choices[0]?.message?.content ?? "";
}

function parseAiResponse(raw: string, platformKeys: string[]): Map<string, string> | null {
  let cleaned = raw.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  try {
    const parsed = JSON.parse(cleaned);
    const result = new Map<string, string>();
    for (const key of platformKeys) {
      if (typeof parsed[key] === "string" && parsed[key].length > 0) {
        result.set(key, parsed[key]);
      }
    }
    if (result.size === 0) return null;
    return result;
  } catch {
    return null;
  }
}

export function buildAiOptions(aiConfig: AiConfig, overrides?: { provider?: string; model?: string }): AiGenerateOptions | null {
  const apiKey = aiConfig.api_key;
  if (!apiKey) return null;

  return {
    provider: (overrides?.provider ?? aiConfig.provider) as "anthropic" | "openai",
    model: overrides?.model ?? aiConfig.model,
    apiKey,
  };
}

export async function generateWithAi(
  ctx: AnnounceContext,
  adapters: Map<string, Adapter>,
  options: AiGenerateOptions,
  verbosity?: Verbosity,
  diff?: string,
  systemPrompt?: string,
  revisionFeedback?: { previousTexts: Map<string, string>; feedback: string },
  language?: string,
): Promise<Map<string, string>> {
  const platforms: PlatformConstraint[] = Array.from(adapters.entries()).map(([key, adapter]) => ({
    key,
    name: adapter.name,
    maxTextLength: adapter.maxTextLength,
    supportsMarkdown: adapter.supportsMarkdown,
    supportsHtml: adapter.supportsHtml,
  }));

  // Build per-platform language map from adapter config (used when --lang is not set globally)
  const perPlatformLanguage: Record<string, string> = {};
  if (!language) {
    for (const [key, adapter] of adapters) {
      if (adapter.language) perPlatformLanguage[key] = adapter.language;
    }
  }

  const prompt = buildPrompt(ctx, platforms, verbosity, diff, systemPrompt, revisionFeedback, language,
    Object.keys(perPlatformLanguage).length > 0 ? perPlatformLanguage : undefined);

  let raw: string;
  try {
    if (options.provider === "openai") {
      raw = await callOpenAI(prompt, options);
    } else {
      raw = await callAnthropic(prompt, options);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`AI provider error: ${msg}`);
  }

  const platformKeys = Array.from(adapters.keys());
  const parsed = parseAiResponse(raw, platformKeys);
  if (!parsed) {
    throw new Error("Failed to parse AI response. The model returned invalid JSON.");
  }

  // Safety: truncate any text that exceeds platform limits
  for (const [key, adapter] of adapters) {
    const text = parsed.get(key);
    if (text && text.length > adapter.maxTextLength) {
      parsed.set(key, text.slice(0, adapter.maxTextLength - 3) + "...");
    }
  }

  return parsed;
}
