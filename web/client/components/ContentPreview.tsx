import React from "react";
import ReactMarkdown from "react-markdown";

interface ContentPreviewProps {
  platformKey: string;
  text: string;
  sessionId?: string | null;
  onClose: () => void;
}

function getPlatformFormat(key: string): "markdown" | "html" | "plain" {
  const base = key.split(":")[0];
  if (base === "blog" || base === "medium") return "markdown";
  if (base === "telegram") return "html";
  return "plain";
}

function getPlatformLabel(key: string): string {
  const [base, lang] = key.split(":");
  const names: Record<string, string> = {
    telegram: "Telegram", x: "X / Twitter", bluesky: "Bluesky",
    mastodon: "Mastodon", medium: "Medium", discord: "Discord", blog: "Blog",
  };
  return lang ? `${names[base] ?? base} [${lang}]` : (names[base] ?? base);
}

// Replace ./image-N.png references with real API screenshot URLs
function resolveImageUrls(text: string, sessionId?: string | null): string {
  if (!sessionId) return text;
  return text.replace(/\.\/image-(\d+)\.png/g, (_, idx) => `/api/screenshots/${sessionId}/${idx}`);
}

export function ContentPreview({ platformKey, text, sessionId, onClose }: ContentPreviewProps) {
  const format = getPlatformFormat(platformKey);
  const label = getPlatformLabel(platformKey);
  const resolvedText = resolveImageUrls(text, sessionId);

  return (
    <div className="content-preview">
      <div className="content-preview__header">
        <span className="content-preview__title">{label} — Preview</span>
        <button className="content-preview__close" onClick={onClose} title="Close preview">✕</button>
      </div>
      <div className="content-preview__body">
        {format === "markdown" ? (
          <div className="content-preview__markdown">
            <ReactMarkdown>{resolvedText}</ReactMarkdown>
          </div>
        ) : format === "html" ? (
          <div
            className="content-preview__html"
            dangerouslySetInnerHTML={{ __html: resolvedText }}
          />
        ) : (
          <div className="content-preview__plain">
            {resolvedText.split("\n").map((line, i, arr) => (
              <React.Fragment key={i}>
                {line || <br />}
                {i < arr.length - 1 && <br />}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
