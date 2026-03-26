import React, { useState } from "react";
import type { AnnounceStartRequest } from "../../shared/api-types";

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

  // Auth fields
  const [authType, setAuthType] = useState<"none" | "basic" | "token" | "cookie">("none");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [authCookie, setAuthCookie] = useState("");
  const [authLoginUrl, setAuthLoginUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description && !fromGit) return;

    let auth: AnnounceStartRequest["auth"] = undefined;
    if (appUrl && authType !== "none") {
      if (authType === "basic" && (authUsername || authPassword)) {
        auth = { username: authUsername || undefined, password: authPassword || undefined, loginUrl: authLoginUrl || undefined };
      } else if (authType === "token" && authToken) {
        auth = { token: authToken };
      } else if (authType === "cookie" && authCookie) {
        auth = { cookies: authCookie };
      }
    }

    onSubmit({
      description: description || undefined,
      fromGit: fromGit || undefined,
      appUrl: appUrl || undefined,
      auth,
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

      {appUrl && (
        <div className="form-group">
          <label className="form-label">Auth</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {(["none", "basic", "token", "cookie"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`platform-chip${authType === t ? " platform-chip--active" : ""}`}
                onClick={() => setAuthType(t)}
                disabled={disabled}
              >
                {t}
              </button>
            ))}
          </div>

          {authType === "basic" && (
            <>
              <div className="form-row">
                <input
                  className="form-input"
                  placeholder="username / email"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  disabled={disabled}
                  autoComplete="off"
                />
                <input
                  className="form-input"
                  type="password"
                  placeholder="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  disabled={disabled}
                  autoComplete="new-password"
                />
              </div>
              <input
                className="form-input"
                style={{ marginTop: 6 }}
                placeholder="Login page URL (e.g. http://localhost:3001/login)"
                value={authLoginUrl}
                onChange={(e) => setAuthLoginUrl(e.target.value)}
                disabled={disabled}
              />
            </>
          )}

          {authType === "token" && (
            <input
              className="form-input"
              placeholder="Bearer token"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              disabled={disabled}
              autoComplete="off"
            />
          )}

          {authType === "cookie" && (
            <input
              className="form-input"
              placeholder='e.g. session=abc123; token=xyz'
              value={authCookie}
              onChange={(e) => setAuthCookie(e.target.value)}
              disabled={disabled}
              autoComplete="off"
            />
          )}
        </div>
      )}

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
            <button
              type="button"
              className={`platform-chip${fromGit ? " platform-chip--active" : ""}`}
              onClick={() => setFromGit((v) => !v)}
              disabled={disabled}
            >
              <span className="platform-chip__dot" />
              from git
            </button>
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
