import type { Adapter, PostContent, PostResult } from "./types.js";
import type { DevToConfig } from "../config/schema.js";
import { PlatformError, suggestForHttpError } from "../utils/errors.js";

const BASE_URL = "https://dev.to/api";

export class DevToAdapter implements Adapter {
  name = "DEV.to";
  maxTextLength = 100_000;
  supportsImages = true;
  supportsHtml = false;
  supportsMarkdown = true;
  language: string | undefined;

  constructor(private config: DevToConfig) {
    this.language = config.language;
  }

  formatText(text: string): string {
    return text;
  }

  async validate(): Promise<boolean> {
    if (!this.config.api_key) return false;
    try {
      const res = await fetch(`${BASE_URL}/users/me`, {
        headers: { "api-key": this.config.api_key },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async validateOrThrow(): Promise<void> {
    if (!this.config.api_key) {
      throw new Error("DEV.to API key is required. Get one at dev.to/settings/extensions");
    }
    const res = await fetch(`${BASE_URL}/users/me`, {
      headers: { "api-key": this.config.api_key },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let msg = `Authentication failed (${res.status})`;
      if (res.status === 401) msg = "Invalid API key. Get one at dev.to/settings/extensions";
      else if (body) msg += `: ${body}`;
      throw new PlatformError(this.name, msg, suggestForHttpError(res.status, this.name), res.status);
    }
  }

  /** Upload a single image buffer to DEV.to and return the hosted URL. */
  private async uploadImage(imageBuffer: Buffer, index: number): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: "image/png" });
    formData.append("image", blob, `image-${index}.png`);

    const res = await fetch(`${BASE_URL}/images`, {
      method: "POST",
      headers: { "api-key": this.config.api_key! },
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Image upload failed (${res.status})`);
    }

    const data = (await res.json()) as { image_of?: { url?: string }; url?: string };
    const url = data.image_of?.url ?? data.url;
    if (!url) throw new Error("Image upload succeeded but response contained no URL");
    return url;
  }

  async post(content: PostContent): Promise<PostResult[]> {
    if (content.language && this.config.language && content.language !== this.config.language) {
      return [];
    }
    const start = Date.now();
    try {
      const rawText = content.markdown ?? content.text;

      // Upload images and build a URL map (./image-N.png → hosted URL)
      const imageUrls: string[] = [];
      if (content.images && content.images.length > 0) {
        for (let i = 0; i < content.images.length; i++) {
          try {
            const url = await this.uploadImage(content.images[i], i);
            imageUrls.push(url);
          } catch {
            // If upload fails, skip replacement for this image
            imageUrls.push("");
          }
        }
      }

      // Extract title from first # heading or first line
      const lines = rawText.split("\n");
      let title = "";
      let body = rawText;
      const headingLine = lines.find((l) => l.startsWith("# "));
      if (headingLine) {
        title = headingLine.replace(/^#\s*/, "").trim();
        body = lines.filter((l) => l !== headingLine).join("\n").trimStart();
      } else {
        title = lines[0].replace(/^#+\s*/, "").trim();
        body = lines.slice(1).join("\n").trimStart();
      }
      if (title.length > 128) title = title.slice(0, 125) + "...";

      // Replace ./image-N.png references with uploaded URLs
      if (imageUrls.length > 0) {
        body = body.replace(/!\[([^\]]*)\]\(\.\/image-(\d+)\.(?:png|jpg|jpeg|gif|webp)\)/gi, (_match, alt, idx) => {
          const i = parseInt(idx, 10);
          const url = i < imageUrls.length ? imageUrls[i] : "";
          return url ? `![${alt}](${url})` : `![${alt}](./image-${i}.png)`;
        });
      }

      const article: Record<string, unknown> = {
        title,
        body_markdown: body,
        published: this.config.publish_status === "public",
        tags: this.config.tags ?? [],
      };

      const res = await fetch(`${BASE_URL}/articles`, {
        method: "POST",
        headers: {
          "api-key": this.config.api_key!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ article }),
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
