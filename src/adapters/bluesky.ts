import type { Adapter, PostContent, PostResult } from "./types.js";
import type { BlueskyConfig } from "../config/schema.js";
import { PlatformError, suggestForHttpError } from "../utils/errors.js";
import { getImageMimeType } from "../utils/image.js";

const BASE_URL = "https://bsky.social/xrpc";

interface BlueskySession {
  did: string;
  accessJwt: string;
}

interface RichTextFacet {
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: string; uri?: string }>;
}

function detectFacets(text: string): RichTextFacet[] {
  const facets: RichTextFacet[] = [];
  const encoder = new TextEncoder();

  // Detect URLs
  const urlRegex = /https?:\/\/[^\s<>)"]+/g;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    const beforeBytes = encoder.encode(text.slice(0, match.index)).length;
    const matchBytes = encoder.encode(match[0]).length;
    facets.push({
      index: { byteStart: beforeBytes, byteEnd: beforeBytes + matchBytes },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: match[0] }],
    });
  }

  return facets;
}

export class BlueskyAdapter implements Adapter {
  name = "Bluesky";
  maxTextLength = 300;
  supportsImages = true;
  supportsHtml = false;
  supportsMarkdown = false;

  private session: BlueskySession | null = null;

  constructor(private config: BlueskyConfig) {}

  formatText(text: string): string {
    // Bluesky counts graphemes, not bytes
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const graphemes = [...segmenter.segment(text)].map((s) => s.segment);
    if (graphemes.length <= this.maxTextLength) return text;
    return graphemes.slice(0, this.maxTextLength - 1).join("") + "…";
  }

  private async createSession(): Promise<BlueskySession> {
    if (this.session) return this.session;

    const res = await fetch(`${BASE_URL}/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: this.config.handle,
        password: this.config.app_password,
      }),
    });

    if (!res.ok) {
      throw new PlatformError(
        this.name,
        `Authentication failed (${res.status})`,
        suggestForHttpError(res.status, this.name),
        res.status,
      );
    }

    const data = (await res.json()) as BlueskySession;
    this.session = data;
    return data;
  }

  async validate(): Promise<boolean> {
    if (!this.config.handle || !this.config.app_password) return false;
    try {
      await this.createSession();
      return true;
    } catch {
      return false;
    }
  }

  private async uploadBlob(session: BlueskySession, imageBuffer: Buffer): Promise<{ $type: string; ref: { $link: string }; mimeType: string; size: number }> {
    const mimeType = getImageMimeType(imageBuffer);
    const res = await fetch(`${BASE_URL}/com.atproto.repo.uploadBlob`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        "Content-Type": mimeType,
      },
      body: imageBuffer,
    });

    if (!res.ok) {
      throw new PlatformError(this.name, `Blob upload failed (${res.status})`, undefined, res.status);
    }

    const data = (await res.json()) as { blob: { ref: { $link: string }; mimeType: string; size: number } };
    return {
      $type: "blob",
      ref: data.blob.ref,
      mimeType: data.blob.mimeType,
      size: data.blob.size,
    };
  }

  async post(content: PostContent): Promise<PostResult[]> {
    if (content.language && this.config.language && content.language !== this.config.language) {
      return [];
    }
    const start = Date.now();
    try {
      const session = await this.createSession();
      const text = this.formatText(content.text);
      const facets = detectFacets(text);

      const record: Record<string, unknown> = {
        $type: "app.bsky.feed.post",
        text,
        createdAt: new Date().toISOString(),
      };

      if (facets.length > 0) {
        record.facets = facets;
      }

      if (content.images && content.images.length > 0) {
        const imageEmbeds = [];
        for (const image of content.images.slice(0, 4)) {
          const blob = await this.uploadBlob(session, image);
          imageEmbeds.push({ alt: "", image: blob });
        }
        record.embed = {
          $type: "app.bsky.embed.images",
          images: imageEmbeds,
        };
      }

      const res = await fetch(`${BASE_URL}/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: session.did,
          collection: "app.bsky.feed.post",
          record,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new PlatformError(this.name, `Post failed: ${body}`, undefined, res.status);
      }

      const data = (await res.json()) as { uri: string };
      // Convert AT URI to web URL
      const rkey = data.uri.split("/").pop();
      const url = `https://bsky.app/profile/${this.config.handle}/post/${rkey}`;

      return [
        {
          platform: this.name,
          success: true,
          url,
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
