import type { Adapter, PostContent, PostResult } from "./types.js";
import type { MediumConfig } from "../config/schema.js";
import { PlatformError, suggestForHttpError } from "../utils/errors.js";

const BASE_URL = "https://api.medium.com/v1";

export class MediumAdapter implements Adapter {
  name = "Medium";
  maxTextLength = 100_000;
  supportsImages = false;
  supportsHtml = true;
  supportsMarkdown = true;

  private userId: string | null = null;

  constructor(private config: MediumConfig) {}

  formatText(text: string): string {
    return text;
  }

  private async getUserId(): Promise<string> {
    if (this.userId) return this.userId;

    const res = await fetch(`${BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${this.config.integration_token}` },
    });

    if (!res.ok) {
      throw new PlatformError(
        this.name,
        `Auth failed (${res.status})`,
        suggestForHttpError(res.status, this.name),
        res.status,
      );
    }

    const data = (await res.json()) as { data: { id: string } };
    this.userId = data.data.id;
    return this.userId;
  }

  async validate(): Promise<boolean> {
    if (!this.config.integration_token) return false;
    try {
      await this.getUserId();
      return true;
    } catch {
      return false;
    }
  }

  async post(content: PostContent): Promise<PostResult[]> {
    const start = Date.now();
    try {
      const userId = await this.getUserId();

      // Extract title from first line or use truncated text
      const lines = (content.markdown ?? content.text).split("\n");
      let title = lines[0].replace(/^#+\s*/, "").trim();
      if (title.length > 100) title = title.slice(0, 97) + "...";

      const body: Record<string, unknown> = {
        title,
        contentFormat: content.markdown ? "markdown" : "html",
        content: content.markdown ?? content.html ?? content.text,
        publishStatus: this.config.publish_status ?? "draft",
      };

      const res = await fetch(`${BASE_URL}/users/${userId}/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.integration_token}`,
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

      const data = (await res.json()) as { data: { url: string } };

      return [
        {
          platform: this.name,
          success: true,
          url: data.data.url,
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
