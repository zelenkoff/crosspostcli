import type { Adapter, PostContent, PostResult, ThreadPost } from "./types.js";
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

interface PostRef {
  uri: string;
  cid: string;
}

function detectFacets(text: string): RichTextFacet[] {
  const facets: RichTextFacet[] = [];
  const encoder = new TextEncoder();

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

/** Trim text to Bluesky's 300-grapheme limit */
function trimToLimit(text: string, limit = 300): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const graphemes = [...segmenter.segment(text)].map((s) => s.segment);
  if (graphemes.length <= limit) return text;
  return graphemes.slice(0, limit - 1).join("") + "…";
}

export class BlueskyAdapter implements Adapter {
  name = "Bluesky";
  /**
   * For a single post: 300 chars.
   * For threads: much higher effective limit — the AI gets ~280 chars × N posts.
   * We set this high so the AI writes thread-length content; the adapter splits it.
   */
  maxTextLength = 2000;
  supportsImages = true;
  supportsHtml = false;
  supportsMarkdown = false;
  language: string | undefined;

  private session: BlueskySession | null = null;

  constructor(private config: BlueskyConfig) {
    this.language = config.language;
  }

  formatText(text: string): string {
    return trimToLimit(text, 300);
  }

  private async createSession(): Promise<BlueskySession> {
    if (this.session) return this.session;

    // Normalize handle: strip leading @ if present
    const handle = (this.config.handle ?? "").replace(/^@/, "");

    const res = await fetch(`${BASE_URL}/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: handle,
        password: this.config.app_password,
      }),
    });

    if (!res.ok) {
      // Read the actual error body from Bluesky for a useful message
      let detail = "";
      try {
        const body = await res.json() as { message?: string; error?: string };
        detail = body.message ?? body.error ?? "";
      } catch {
        // ignore parse failure
      }

      const msg = detail
        ? `Authentication failed: ${detail}`
        : `Authentication failed (HTTP ${res.status})`;

      const suggestion = res.status === 401
        ? `Check your handle and app password.\n` +
          `• Handle should be like "user.bsky.social" (not your email)\n` +
          `• Use an App Password, NOT your account password\n` +
          `• Create one at: https://bsky.app/settings/app-passwords`
        : suggestForHttpError(res.status, this.name);

      throw new PlatformError(this.name, msg, suggestion, res.status);
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

  /** Like validate() but throws with a descriptive error on failure */
  async validateOrThrow(): Promise<void> {
    if (!this.config.handle) {
      throw new PlatformError(this.name, "Handle is required", "Enter your Bluesky handle, e.g. user.bsky.social");
    }
    if (!this.config.app_password) {
      throw new PlatformError(
        this.name,
        "App Password is required",
        "Create one at: https://bsky.app/settings/app-passwords\n(Do NOT use your account password)",
      );
    }
    await this.createSession();
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

  /** Create a single AT Protocol post record and return its URI + CID */
  private async createPost(
    session: BlueskySession,
    text: string,
    images: Buffer[],
    reply?: { root: PostRef; parent: PostRef },
  ): Promise<PostRef> {
    const trimmed = trimToLimit(text);
    const facets = detectFacets(trimmed);

    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    if (facets.length > 0) record.facets = facets;

    if (images.length > 0) {
      const imageEmbeds = [];
      for (const img of images.slice(0, 4)) {
        const blob = await this.uploadBlob(session, img);
        imageEmbeds.push({ alt: "", image: blob });
      }
      record.embed = { $type: "app.bsky.embed.images", images: imageEmbeds };
    }

    if (reply) record.reply = reply;

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

    const data = (await res.json()) as { uri: string; cid: string };
    return { uri: data.uri, cid: data.cid };
  }

  async post(content: PostContent): Promise<PostResult[]> {
    if (content.language && this.config.language && content.language !== this.config.language) {
      return [];
    }
    const start = Date.now();
    try {
      const session = await this.createSession();
      const handle = (this.config.handle ?? "").replace(/^@/, "");

      // ── Thread mode ──────────────────────────────────────────────────
      if (content.thread && content.thread.length > 1) {
        const posts = content.thread;
        let root: PostRef | null = null;
        let parent: PostRef | null = null;
        let rootUrl = "";

        for (let i = 0; i < posts.length; i++) {
          const p = posts[i];
          const images: Buffer[] = [];

          // Attach the designated screenshot for this thread post
          if (typeof p.imageIndex === "number" && content.images?.[p.imageIndex]) {
            images.push(content.images[p.imageIndex]);
          }

          const reply = root && parent
            ? { root, parent }
            : undefined;

          const ref = await this.createPost(session, p.text, images, reply);

          if (i === 0) {
            root = ref;
            const rkey = ref.uri.split("/").pop();
            rootUrl = `https://bsky.app/profile/${handle}/post/${rkey}`;
          }
          parent = ref;

          // Small delay between posts to avoid rate limits
          if (i < posts.length - 1) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }

        return [{
          platform: this.name,
          success: true,
          url: rootUrl,
          durationMs: Date.now() - start,
        }];
      }

      // ── Single post mode ─────────────────────────────────────────────
      const images = content.images ?? [];
      const ref = await this.createPost(session, content.text, images);
      const rkey = ref.uri.split("/").pop();
      const url = `https://bsky.app/profile/${handle}/post/${rkey}`;

      return [{
        platform: this.name,
        success: true,
        url,
        durationMs: Date.now() - start,
      }];
    } catch (err) {
      return [{
        platform: this.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      }];
    }
  }
}
