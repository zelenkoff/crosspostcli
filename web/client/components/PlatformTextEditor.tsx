import React from "react";

const PLATFORM_LIMITS: Record<string, number> = {
  x: 280,
  bluesky: 300,
  mastodon: 500,
  telegram: 4096,
  discord: 2000,
  medium: 50000,
  blog: 100000,
};

function getLimit(key: string): number {
  const base = key.split(":")[0];
  return PLATFORM_LIMITS[base] ?? 4096;
}

function getPlatformIcon(key: string): string {
  const base = key.split(":")[0];
  const icons: Record<string, string> = {
    telegram: "✈",
    x: "✕",
    bluesky: "☁",
    mastodon: "🐘",
    medium: "M",
    discord: "◈",
    blog: "📝",
  };
  return icons[base] ?? "◆";
}

function getPlatformLabel(key: string): string {
  const [base, lang] = key.split(":");
  const names: Record<string, string> = {
    telegram: "Telegram",
    x: "X / Twitter",
    bluesky: "Bluesky",
    mastodon: "Mastodon",
    medium: "Medium",
    discord: "Discord",
    blog: "Blog",
  };
  const name = names[base] ?? base;
  return lang ? `${name} [${lang}]` : name;
}

interface PlatformTextEditorProps {
  platformKey: string;
  value: string;
  onChange: (key: string, value: string) => void;
}

export function PlatformTextEditor({ platformKey, value, onChange }: PlatformTextEditorProps) {
  const limit = getLimit(platformKey);
  const len = value.length;
  const lang = platformKey.includes(":") ? platformKey.split(":")[1] : undefined;

  const charsClass =
    len > limit ? "platform-editor__chars--over" :
    len > limit * 0.9 ? "platform-editor__chars--warn" :
    "";

  return (
    <div className="platform-editor fade-in">
      <div className="platform-editor__header">
        <div className="platform-editor__name">
          <span>{getPlatformIcon(platformKey)}</span>
          {getPlatformLabel(platformKey)}
          {lang && <span className="platform-editor__lang">{lang}</span>}
        </div>
        <span className={`platform-editor__chars ${charsClass}`}>
          {len}/{limit}
        </span>
      </div>
      <textarea
        className="platform-editor__textarea"
        value={value}
        onChange={(e) => onChange(platformKey, e.target.value)}
        rows={5}
        placeholder={`Content for ${getPlatformLabel(platformKey)}...`}
      />
    </div>
  );
}
