import type { Changelog, CommitInfo } from "./changelog.js";
import type { Adapter } from "../adapters/types.js";

export type Tone = "professional" | "casual" | "excited";
export type TemplateType = "release" | "feature" | "bugfix" | "update";
export type Verbosity = "brief" | "normal" | "detailed";
type PlatformTier = "short" | "medium" | "long" | "article";

export interface AnnounceContext {
  projectName: string;
  version?: string;
  description?: string;
  changelog?: Changelog;
  url?: string;
  tone: Tone;
  template: TemplateType;
}

function getTier(maxTextLength: number): PlatformTier {
  if (maxTextLength <= 300) return "short";
  if (maxTextLength <= 500) return "medium";
  if (maxTextLength <= 5000) return "long";
  return "article";
}

function emoji(tone: Tone, template: TemplateType): string {
  if (tone === "professional") return "";
  const map: Record<TemplateType, string> = {
    release: tone === "excited" ? "🚀🎉" : "🚀",
    feature: tone === "excited" ? "✨🎉" : "✨",
    bugfix: tone === "excited" ? "🐛✅" : "🔧",
    update: tone === "excited" ? "📢🎉" : "📢",
  };
  return map[template] + " ";
}

function intro(tone: Tone, template: TemplateType, projectName: string, version?: string): string {
  const ver = version ? ` ${version}` : "";
  if (tone === "professional") {
    const verbs: Record<TemplateType, string> = {
      release: `${projectName}${ver} has been released.`,
      feature: `New features are now available in ${projectName}${ver}.`,
      bugfix: `Bug fixes have been applied to ${projectName}${ver}.`,
      update: `${projectName}${ver} has been updated.`,
    };
    return verbs[template];
  }
  if (tone === "excited") {
    const verbs: Record<TemplateType, string> = {
      release: `${projectName}${ver} is here!`,
      feature: `Just shipped new features in ${projectName}${ver}!`,
      bugfix: `Squashed some bugs in ${projectName}${ver}!`,
      update: `Fresh update for ${projectName}${ver}!`,
    };
    return verbs[template];
  }
  // casual
  const verbs: Record<TemplateType, string> = {
    release: `${projectName}${ver} is out.`,
    feature: `New in ${projectName}${ver}:`,
    bugfix: `Bug fixes in ${projectName}${ver}:`,
    update: `${projectName}${ver} update:`,
  };
  return verbs[template];
}

function bulletList(commits: CommitInfo[], max: number): string {
  return commits
    .slice(0, max)
    .map((c) => `- ${c.subject}`)
    .join("\n");
}

function headline(ctx: AnnounceContext): string {
  if (ctx.description) return ctx.description;
  if (ctx.changelog) {
    const top = ctx.changelog.features[0] ?? ctx.changelog.fixes[0] ?? ctx.changelog.commits[0];
    if (top) return top.subject;
  }
  return "New update available";
}

function generateShort(ctx: AnnounceContext, maxLen: number): string {
  const e = emoji(ctx.tone, ctx.template);
  const head = headline(ctx);
  const introLine = `${e}${ctx.projectName}${ctx.version ? " " + ctx.version : ""}: ${head}`;

  const parts = [introLine];
  if (ctx.url) parts.push(ctx.url);

  let text = parts.join("\n\n");

  // If over limit, trim the headline
  if (text.length > maxLen) {
    const urlPart = ctx.url ? `\n\n${ctx.url}` : "";
    const available = maxLen - urlPart.length - 4; // room for "..."
    text = introLine.slice(0, available) + "..." + urlPart;
  }

  return text;
}

function generateMedium(ctx: AnnounceContext, maxLen: number): string {
  const e = emoji(ctx.tone, ctx.template);
  const introLine = `${e}${intro(ctx.tone, ctx.template, ctx.projectName, ctx.version)}`;

  const parts = [introLine];

  if (ctx.description) {
    parts.push(ctx.description);
  }

  if (ctx.changelog) {
    const topItems = [...ctx.changelog.features, ...ctx.changelog.fixes].slice(0, 3);
    if (topItems.length > 0) {
      parts.push(bulletList(topItems, 3));
    }
  }

  if (ctx.url) parts.push(ctx.url);

  let text = parts.join("\n\n");
  if (text.length > maxLen) {
    text = text.slice(0, maxLen - 3) + "...";
  }
  return text;
}

function generateLong(ctx: AnnounceContext): string {
  const e = emoji(ctx.tone, ctx.template);
  const introLine = `${e}${intro(ctx.tone, ctx.template, ctx.projectName, ctx.version)}`;

  const sections: string[] = [introLine];

  if (ctx.description) {
    sections.push(ctx.description);
  }

  if (ctx.changelog) {
    if (ctx.changelog.features.length > 0) {
      sections.push(`What's new:\n${bulletList(ctx.changelog.features, 10)}`);
    }
    if (ctx.changelog.fixes.length > 0) {
      sections.push(`Bug fixes:\n${bulletList(ctx.changelog.fixes, 10)}`);
    }
    if (ctx.changelog.other.length > 0 && ctx.changelog.features.length + ctx.changelog.fixes.length < 5) {
      sections.push(`Other changes:\n${bulletList(ctx.changelog.other, 5)}`);
    }
  }

  if (ctx.url) sections.push(ctx.url);

  return sections.join("\n\n");
}

function generateArticle(ctx: AnnounceContext): string {
  const ver = ctx.version ? ` ${ctx.version}` : "";
  const titleMap: Record<TemplateType, string> = {
    release: `${ctx.projectName}${ver} Release Notes`,
    feature: `New Features in ${ctx.projectName}${ver}`,
    bugfix: `Bug Fixes in ${ctx.projectName}${ver}`,
    update: `${ctx.projectName}${ver} Update`,
  };

  const sections: string[] = [`# ${titleMap[ctx.template]}`];

  // Intro paragraph
  sections.push(intro(ctx.tone, ctx.template, ctx.projectName, ctx.version));

  if (ctx.description) {
    sections.push(ctx.description);
  }

  if (ctx.changelog) {
    if (ctx.changelog.features.length > 0) {
      const items = ctx.changelog.features.map((c) => {
        const detail = c.body ? `\n  ${c.body.split("\n")[0]}` : "";
        return `- **${c.subject}**${detail}`;
      });
      sections.push(`## What's New\n\n${items.join("\n")}`);
    }

    if (ctx.changelog.fixes.length > 0) {
      const items = ctx.changelog.fixes.map((c) => `- ${c.subject}`);
      sections.push(`## Bug Fixes\n\n${items.join("\n")}`);
    }

    if (ctx.changelog.other.length > 0) {
      const items = ctx.changelog.other.map((c) => `- ${c.subject}`);
      sections.push(`## Other Changes\n\n${items.join("\n")}`);
    }
  }

  if (ctx.url) {
    sections.push(`---\n\n[View full changelog](${ctx.url})`);
  }

  return sections.join("\n\n");
}

/**
 * Map verbosity to a tier override. "brief" forces short output,
 * "detailed" forces the longest output the platform supports,
 * "normal" (default) uses the automatic tier from maxTextLength.
 */
function applyVerbosity(autoTier: PlatformTier, verbosity?: Verbosity): PlatformTier {
  if (!verbosity || verbosity === "normal") return autoTier;
  if (verbosity === "brief") {
    // Clamp down: article→medium, long→medium, medium→short, short→short
    if (autoTier === "article") return "medium";
    if (autoTier === "long") return "medium";
    return "short";
  }
  // detailed: push up, but respect platform max (article platforms stay article)
  if (autoTier === "short") return "medium";
  if (autoTier === "medium") return "long";
  return autoTier;
}

export function generateForPlatform(ctx: AnnounceContext, platformKey: string, adapter: Adapter, verbosity?: Verbosity): string {
  const autoTier = getTier(adapter.maxTextLength);
  const tier = applyVerbosity(autoTier, verbosity);

  let text: string;
  switch (tier) {
    case "short":
      text = generateShort(ctx, adapter.maxTextLength);
      break;
    case "medium":
      text = generateMedium(ctx, adapter.maxTextLength);
      break;
    case "long":
      text = generateLong(ctx);
      break;
    case "article":
      text = generateArticle(ctx);
      break;
  }

  // For article-tier platforms that support markdown, keep as-is
  if (tier === "article" && (adapter.supportsMarkdown || adapter.supportsHtml)) {
    return text;
  }

  return adapter.formatText(text);
}

export function detectTemplate(changelog?: Changelog): TemplateType {
  if (!changelog || changelog.commits.length === 0) return "update";
  if (changelog.features.length > 0 && changelog.fixes.length === 0) return "feature";
  if (changelog.fixes.length > 0 && changelog.features.length === 0) return "bugfix";
  if (changelog.features.length > 0 || changelog.fixes.length > 0) return "release";
  return "update";
}

export function generateAllPlatforms(
  ctx: AnnounceContext,
  adapters: Map<string, Adapter>,
  verbosity?: Verbosity,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, adapter] of adapters) {
    result.set(key, generateForPlatform(ctx, key, adapter, verbosity));
  }
  return result;
}
