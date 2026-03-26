import React, { useState } from "react";
import type { AnnounceStartRequest } from "../../shared/api-types.js";

interface ComposeFormProps {
  onSubmit: (req: AnnounceStartRequest) => void;
  disabled?: boolean;
}

const TONES = ["casual", "professional", "excited"];
const VERBOSITIES = ["brief", "normal", "detailed"];

export function ComposeForm({ onSubmit, disabled }: ComposeFormProps) {
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState("casual");
  const [verbosity, setVerbosity] = useState("normal");
  const [appUrl, setAppUrl] = useState("");
  const [fromGit, setFromGit] = useState(false);
  const [lang, setLang] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description && !fromGit) return;

    onSubmit({
      description: description || undefined,
      fromGit: fromGit || undefined,
      appUrl: appUrl || undefined,
      tone,
      verbosity,
      lang: lang || undefined,
    });
  };

  return (
    <form className="compose-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea
          className="form-textarea"
          placeholder="What changed? Describe the update..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={disabled}
          rows={3}
        />
      </div>

      <div className="form-group">
        <label className="form-label">App URL (optional)</label>
        <input
          className="form-input"
          type="text"
          placeholder="http://localhost:3000  (enables screenshots)"
          value={appUrl}
          onChange={(e) => setAppUrl(e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Tone</label>
          <select
            className="form-select"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            disabled={disabled}
          >
            {TONES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Verbosity</label>
          <select
            className="form-select"
            value={verbosity}
            onChange={(e) => setVerbosity(e.target.value)}
            disabled={disabled}
          >
            {VERBOSITIES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <button
          type="button"
          className="form-toggle"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "▾" : "▸"} advanced options
        </button>
      </div>

      {showAdvanced && (
        <>
          <div className="form-separator" />

          <div className="form-group">
            <label className="form-label">Language</label>
            <input
              className="form-input"
              placeholder="e.g. en, ru, es (leave empty for per-channel)"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              disabled={disabled}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Source</label>
            <label className="platform-chip" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={fromGit}
                onChange={(e) => setFromGit(e.target.checked)}
                style={{ display: "none" }}
                disabled={disabled}
              />
              <span className={`platform-chip${fromGit ? " platform-chip--active" : ""}`}>
                <span className="platform-chip__dot" />
                from git
              </span>
            </label>
          </div>
        </>
      )}

      <div className="form-separator" />

      <button
        type="submit"
        className="btn btn--primary btn--full"
        disabled={disabled || (!description && !fromGit)}
      >
        {disabled ? "generating..." : "generate ›"}
      </button>
    </form>
  );
}
