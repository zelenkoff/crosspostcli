import type { Adapter, PostContent, PostResult } from "./types.js";
import type { TelegramConfig } from "../config/schema.js";
import { PlatformError, suggestForHttpError } from "../utils/errors.js";

export class TelegramAdapter implements Adapter {
  name = "Telegram";
  maxTextLength = 4096;
  supportsImages = true;
  supportsHtml = true;
  supportsMarkdown = false;

  constructor(private config: TelegramConfig) {}

  formatText(text: string): string {
    return text.slice(0, this.maxTextLength);
  }

  async validate(): Promise<boolean> {
    if (!this.config.bot_token) return false;
    const res = await fetch(`https://api.telegram.org/bot${this.config.bot_token}/getMe`);
    return res.ok;
  }

  async post(content: PostContent): Promise<PostResult[]> {
    const results: PostResult[] = [];
    const channels = this.config.channels;

    if (channels.length === 0) {
      return [
        {
          platform: this.name,
          success: false,
          error: "No channels configured",
          durationMs: 0,
        },
      ];
    }

    for (const channel of channels) {
      if (content.language && channel.language && content.language !== channel.language) {
        continue;
      }

      const start = Date.now();
      try {
        const text = content.html ?? this.formatText(content.text);
        let res: Response;

        if (content.images && content.images.length > 0) {
          const form = new FormData();
          form.append("chat_id", channel.id);
          form.append("caption", text);
          form.append("parse_mode", "HTML");
          form.append("photo", new Blob([content.images[0]]), "image.jpg");

          res = await fetch(`https://api.telegram.org/bot${this.config.bot_token}/sendPhoto`, {
            method: "POST",
            body: form,
          });
        } else {
          res = await fetch(`https://api.telegram.org/bot${this.config.bot_token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: channel.id,
              text,
              parse_mode: "HTML",
            }),
          });
        }

        const data = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };

        if (!data.ok) {
          throw new PlatformError(
            this.name,
            data.description ?? "Unknown Telegram error",
            suggestForHttpError(res.status, this.name),
            res.status,
          );
        }

        const messageId = data.result?.message_id;
        const channelName = channel.id.replace("@", "");
        const url = messageId ? `https://t.me/${channelName}/${messageId}` : undefined;

        results.push({
          platform: this.name,
          channel: channel.label ?? channel.id,
          success: true,
          url,
          durationMs: Date.now() - start,
        });
      } catch (err) {
        results.push({
          platform: this.name,
          channel: channel.label ?? channel.id,
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        });
      }
    }

    return results;
  }
}
