import type { Adapter, PostContent, PostResult } from "./types.js";
import type { MastodonConfig } from "../config/schema.js";
import { PlatformError, suggestForHttpError } from "../utils/errors.js";
import { getImageMimeType } from "../utils/image.js";

export class MastodonAdapter implements Adapter {
  name = "Mastodon";
  maxTextLength = 500;
  supportsImages = true;
  supportsHtml = false;
  supportsMarkdown = false;
  language: string | undefined;

  constructor(private config: MastodonConfig) {
    this.language = config.language;
  }

  private get baseUrl(): string {
    const url = this.config.instance_url ?? "https://mastodon.social";
    // Strip any path after the origin (e.g. user pasted their profile URL)
    try {
      const { origin } = new URL(url);
      return origin;
    } catch {
      return url.replace(/\/+$/, "");
    }
  }

  formatText(text: string): string {
    if (text.length <= this.maxTextLength) return text;
    return text.slice(0, this.maxTextLength - 1) + "…";
  }

  async validate(): Promise<boolean> {
    if (!this.config.access_token || !this.config.instance_url) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/accounts/verify_credentials`, {
        headers: { Authorization: `Bearer ${this.config.access_token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async uploadMedia(imageBuffer: Buffer): Promise<string> {
    const mimeType = getImageMimeType(imageBuffer);
    const form = new FormData();
    form.append("file", new Blob([imageBuffer], { type: mimeType }), "image.jpg");

    const res = await fetch(`${this.baseUrl}/api/v2/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.access_token}` },
      body: form,
    });

    if (!res.ok) {
      throw new PlatformError(this.name, `Media upload failed (${res.status})`, undefined, res.status);
    }

    const data = (await res.json()) as { id: string };
    return data.id;
  }

  async post(content: PostContent): Promise<PostResult[]> {
    if (content.language && this.config.language && content.language !== this.config.language) {
      return [];
    }
    const start = Date.now();
    try {
      const text = this.formatText(content.text);
      const body: Record<string, unknown> = { status: text };

      if (content.images && content.images.length > 0) {
        const mediaIds: string[] = [];
        for (const image of content.images.slice(0, 4)) {
          const id = await this.uploadMedia(image);
          mediaIds.push(id);
        }
        body.media_ids = mediaIds;
      }

      const res = await fetch(`${this.baseUrl}/api/v1/statuses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new PlatformError(
          this.name,
          `Post failed (${res.status}): ${errorBody}`,
          suggestForHttpError(res.status, this.name),
          res.status,
        );
      }

      const data = (await res.json()) as { url: string };

      return [
        {
          platform: this.name,
          success: true,
          url: data.url,
          durationMs: Date.now() - start,
        },
      ];
    } catch (err) {
      return [
        {
          platform: this.name,
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        },
      ];
    }
  }
}
