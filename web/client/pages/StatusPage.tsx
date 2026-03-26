import React, { useEffect, useState } from "react";
import { SplitPane } from "../components/SplitPane.js";
import { PlatformStatusList } from "../components/PlatformStatusList.js";
import { fetchStatus } from "../api/client.js";
import type { PlatformStatusDTO } from "../../shared/api-types.js";

export function StatusPage() {
  const [platforms, setPlatforms] = useState<PlatformStatusDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStatus();
      setPlatforms(data.platforms);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activeCount = platforms.filter((p) => p.status === "success").length;

  const left = (
    <div className="terminal-panel">
      <div className="terminal-panel__header">
        <div className="terminal-panel__dots">
          <div className="terminal-panel__dot terminal-panel__dot--red" />
          <div className="terminal-panel__dot terminal-panel__dot--yellow" />
          <div className="terminal-panel__dot terminal-panel__dot--green" />
        </div>
        <span className="terminal-panel__title">crosspost status</span>
      </div>
      <div className="terminal-panel__body">
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--term-text-dim)" }}>
            <span className="spinner" /> checking connections...
          </div>
        ) : error ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--preview-error)" }}>
            error: {error}
          </div>
        ) : (
          <PlatformStatusList platforms={platforms} />
        )}

        <div style={{ marginTop: "auto" }}>
          <button
            className="btn btn--secondary btn--sm"
            onClick={load}
            disabled={loading}
            style={{ marginTop: 16 }}
          >
            {loading ? "checking..." : "↺ refresh"}
          </button>
        </div>
      </div>
    </div>
  );

  const right = (
    <div className="preview-panel">
      <div className="preview-panel__header">
        <span className="preview-panel__title">Quick Start</span>
      </div>
      <div className="preview-panel__body">
        <div className="hint-card">
          <div className="hint-card__title">// Getting started</div>
          <ul className="hint-card__list">
            <li className="hint-card__item">
              <span className="hint-card__item-num">1</span>
              Run <code style={{ fontFamily: "var(--font-mono)", color: "var(--term-green)", fontSize: 11 }}>crosspost init</code> to configure platforms
            </li>
            <li className="hint-card__item">
              <span className="hint-card__item-num">2</span>
              Go to <strong>Announce</strong> to generate and post content
            </li>
            <li className="hint-card__item">
              <span className="hint-card__item-num">3</span>
              Optionally provide an App URL to enable AI-powered screenshot capture
            </li>
          </ul>
        </div>

        {!loading && activeCount > 0 && (
          <div className="hint-card fade-in">
            <div className="hint-card__title">// {activeCount} platform{activeCount !== 1 ? "s" : ""} connected</div>
            <ul className="hint-card__list">
              {platforms
                .filter((p) => p.status === "success")
                .map((p) => (
                  <li key={p.key} className="hint-card__item">
                    <span className="hint-card__item-num">✓</span>
                    {p.name}{p.detail ? ` — ${p.detail}` : ""}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );

  return <SplitPane left={left} right={right} />;
}
