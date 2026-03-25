import type { Adapter, PostContent, PostResult } from "./types.js";
import type { XConfig } from "../config/schema.js";
import { signRequest } from "../utils/oauth.js";
import { PlatformError, suggestForHttpError } from "../utils/errors.js";
import { getImageMimeType } from "../utils/image.js";

const TWEET_URL = "https://api.twitter.com/2/tweets";
const MEDIA_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

export class XTwitterAdapter implements Adapter {
  name = "X/Twitter";
  maxTextLength = 280;
  supportsImages = true;
  supportsHtml = false;
  supportsMarkdown = false;

  constructor(private config: XConfig) {}

  formatText(text: string): string {
    if (text.length <= this.maxTextLength) return text;
    return text.slice(0, this.maxTextLength - 1) + "…";
  }

  private getOAuthParams() {
    return {
      consumerKey: this.config.api_key!,
      consumerSecret: this.config.api_secret!,
      accessToken: this.config.access_token!,
      accessSecret: this.config.access_secret!,
    };
  }

  async validate(): Promise<boolean> {
    if (!this.config.api_key || !this.config.api_secret || !this.config.access_token || !this.config.access_secret) {
      return false;
    }
    try {
      const url = "https://api.twitter.com/2/users/me";
      const headers = signRequest(this.getOAuthParams(), { method: "GET", url });
      const res = await fetch(url, { headers });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async uploadMedia(imageBuffer: Buffer): Promise<string> {
    const oauth = this.getOAuthParams();
    const mediaType = getImageMimeType(imageBuffer);
    const base64 = imageBuffer.toString("base64");

    const data: Record<string, string> = {
      media_data: base64,
      media_category: "tweet_image",
    };

    // For media upload, we need to use multipart form
    const form = new FormData();
    form.append("media_data", base64);
    form.append("media_category", "tweet_image");

    const headers = signRequest(oauth, {
      method: "POST",
      url: MEDIA_UPLOAD_URL,
    });

    const res = await fetch(MEDIA_UPLOAD_URL, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": `multipart/form-data`,
      },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new PlatformError(
        this.name,
        `Media upload failed: ${body}`,
        suggestForHttpError(res.status, this.name),
        res.status,
      );
    }

    const result = (await res.json()) as { media_id_string: string };
    return result.media_id_string;
  }

  async post(content: PostContent): Promise<PostResult[]> {
    if (content.language && this.config.language && content.language !== this.config.language) {
      return [];
    }
    const start = Date.now();
    try {
      const text = this.formatText(content.text);
      const body: Record<string, unknown> = { text };

      if (content.images && content.images.length > 0) {
        const mediaIds: string[] = [];
        for (const image of content.images.slice(0, 4)) {
          const mediaId = await this.uploadMedia(image);
          mediaIds.push(mediaId);
        }
        body.media = { media_ids: mediaIds };
      }

      const headers = signRequest(this.getOAuthParams(), {
        method: "POST",
        url: TWEET_URL,
      });

      const res = await fetch(TWEET_URL, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new PlatformError(
          this.name,
          `Tweet failed (${res.status}): ${errorBody}`,
          suggestForHttpError(res.status, this.name),
          res.status,
        );
      }

      const data = (await res.json()) as { data: { id: string } };
      const tweetId = data.data.id;

      return [
        {
          platform: this.name,
          success: true,
          url: `https://x.com/i/status/${tweetId}`,
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
