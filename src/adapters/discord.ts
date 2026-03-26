import type { Adapter, PostContent, PostResult } from "./types.js";
import type { DiscordConfig } from "../config/schema.js";
import { PlatformError, suggestForHttpError } from "../utils/errors.js";

export class DiscordAdapter implements Adapter {
  name = "Discord";
  maxTextLength = 2000;
  supportsImages = true;
  supportsHtml = false;
  supportsMarkdown = true;
  language: string | undefined;

  constructor(private config: DiscordConfig) {
    // If all webhooks share the same language, expose it for AI generation routing
    const langs = [...new Set(config.webhooks.map((w) => w.language).filter(Boolean))];
    this.language = langs.length === 1 ? langs[0] : undefined;
  }

  formatText(text: string): string {
    if (text.length <= this.maxTextLength) return text;
    return text.slice(0, this.maxTextLength - 1) + "…";
  }

  async validate(): Promise<boolean> {
    if (!this.config.webhooks || this.config.webhooks.length === 0) return false;
    try {
      // Test first webhook with a GET
      const res = await fetch(this.config.webhooks[0].url);
      return res.ok;
    } catch {
      return false;
    }
  }

  async post(content: PostContent): Promise<PostResult[]> {
    const results: PostResult[] = [];

    if (this.config.webhooks.length === 0) {
      return [
        {
          platform: this.name,
          success: false,
          error: "No webhooks configured",
          durationMs: 0,
        },
      ];
    }

    for (const webhook of this.config.webhooks) {
      if (content.language && webhook.language && content.language !== webhook.language) {
        continue;
      }
      const start = Date.now();
      try {
        const text = this.formatText(content.text);
        let res: Response;

        if (content.images && content.images.length > 0) {
          const form = new FormData();
          form.append("content", text);
          content.images.forEach((img, i) => {
            form.append(`files[${i}]`, new Blob([img]), `image${i}.png`);
          });
          res = await fetch(`${webhook.url}?wait=true`, {
            method: "POST",
            body: form,
          });
        } else {
          res = await fetch(`${webhook.url}?wait=true`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: text }),
          });
        }

        if (!res.ok) {
          throw new PlatformError(
            this.name,
            `Webhook failed (${res.status})`,
            suggestForHttpError(res.status, this.name),
            res.status,
          );
        }

        results.push({
          platform: this.name,
          channel: webhook.label ?? "webhook",
          success: true,
          durationMs: Date.now() - start,
        });
      } catch (err) {
        results.push({
          platform: this.name,
          channel: webhook.label ?? "webhook",
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        });
      }
    }

    return results;
  }
}
