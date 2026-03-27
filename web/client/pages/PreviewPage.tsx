import React, { useEffect, useReducer, useState, useCallback } from "react";
import { useParams } from "wouter";
import { SplitPane } from "../components/SplitPane";
import { PlatformTextEditor } from "../components/PlatformTextEditor";
import { ContentPreview } from "../components/ContentPreview";
import { ScreenshotGallery } from "../components/ScreenshotGallery";
import { PostResults } from "../components/PostResults";
import { ProgressLog } from "../components/ProgressLog";
import { sendRevise, postContent } from "../api/client";
import type { PostResultDTO } from "../../shared/api-types";

type Stage = "loading" | "preview" | "posting" | "done" | "error";

interface PreviewState {
  stage: Stage;
  texts: Record<string, string>;
  screenshotIndices: number[];
  postResults: PostResultDTO[];
  error: string | null;
  revisingLog: string | null;
}

const initial: PreviewState = {
  stage: "loading",
  texts: {},
  screenshotIndices: [],
  postResults: [],
  error: null,
  revisingLog: null,
};

type Action =
  | { type: "loaded"; texts: Record<string, string>; screenshotIndices: number[] }
  | { type: "update_text"; key: string; value: string }
  | { type: "revise_start"; log: string }
  | { type: "revise_done"; texts: Record<string, string> }
  | { type: "post_start" }
  | { type: "post_done"; results: PostResultDTO[] }
  | { type: "error"; message: string };

function reducer(state: PreviewState, action: Action): PreviewState {
  switch (action.type) {
    case "loaded":
      return { ...state, stage: "preview", texts: action.texts, screenshotIndices: action.screenshotIndices };
    case "update_text":
      return { ...state, texts: { ...state.texts, [action.key]: action.value } };
    case "revise_start":
      return { ...state, revisingLog: action.log };
    case "revise_done":
      return { ...state, texts: action.texts, revisingLog: null };
    case "post_start":
      return { ...state, stage: "posting" };
    case "post_done":
      return { ...state, stage: "done", postResults: action.results };
    case "error":
      return { ...state, stage: "error", error: action.message };
    default:
      return state;
  }
}

export function PreviewPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [state, dispatch] = useReducer(reducer, initial);
  const [reviseInput, setReviseInput] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [activePreviewKey, setActivePreviewKey] = useState<string | null>(null);

  // Load session on mount
  useEffect(() => {
    if (!sessionId) {
      dispatch({ type: "error", message: "No session ID in URL" });
      return;
    }
    fetch(`/api/session/${sessionId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Session not found (${r.status})`);
        return r.json();
      })
      .then((data: { texts: Record<string, string>; screenshotIndices: number[] }) => {
        dispatch({ type: "loaded", texts: data.texts, screenshotIndices: data.screenshotIndices });
      })
      .catch((err) => {
        dispatch({ type: "error", message: err.message });
      });
  }, [sessionId]);

  // Poll for SSE-based text updates (revise flow pushes texts events)
  useEffect(() => {
    if (!sessionId || state.stage === "loading") return;
    const es = new EventSource(`/api/announce/${sessionId}/stream`);
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "texts") {
          dispatch({ type: "revise_done", texts: event.texts });
        }
      } catch {}
    };
    return () => es.close();
  }, [sessionId, state.stage]);

  const updateText = useCallback((key: string, value: string) => {
    dispatch({ type: "update_text", key, value });
  }, []);

  const revise = useCallback(async () => {
    if (!sessionId || !reviseInput.trim()) return;
    dispatch({ type: "revise_start", log: `Revising: "${reviseInput.trim()}"...` });
    await sendRevise(sessionId, { feedback: reviseInput.trim() });
    setReviseInput("");
  }, [sessionId, reviseInput]);

  const post = useCallback(async (isDryRun: boolean) => {
    if (!sessionId) return;
    setDryRun(isDryRun);
    dispatch({ type: "post_start" });
    try {
      const response = await postContent({ sessionId, texts: state.texts, dryRun: isDryRun });
      dispatch({ type: "post_done", results: response.results });
      // Notify CLI the preview is done
      fetch(`/api/session/${sessionId}/close`, { method: "POST" }).catch(() => {});
    } catch (err) {
      dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [sessionId, state.texts]);

  const togglePreview = (key: string) => setActivePreviewKey((k) => (k === key ? null : key));

  // ── Left Panel ──────────────────────────────────────────────────────────────
  const left = (
    <div className="terminal-panel">
      <div className="terminal-panel__header">
        <div className="terminal-panel__dots">
          <div className="terminal-panel__dot terminal-panel__dot--red" />
          <div className="terminal-panel__dot terminal-panel__dot--yellow" />
          <div className="terminal-panel__dot terminal-panel__dot--green" />
        </div>
        <span className="terminal-panel__title">crosspost · web preview</span>
      </div>
      <div className="terminal-panel__body">
        {state.stage === "loading" && (
          <div style={{ color: "var(--preview-text-dim)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
            Loading session...
          </div>
        )}
        {state.stage === "error" && (
          <div style={{ color: "var(--preview-error)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
            error › {state.error}
          </div>
        )}
        {(state.stage === "preview" || state.stage === "posting" || state.stage === "done") && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--term-text-dim)" }}>
            <div style={{ marginBottom: 8, color: "var(--term-green)" }}>
              ✓ {Object.keys(state.texts).length} platform{Object.keys(state.texts).length !== 1 ? "s" : ""} ready
            </div>
            <div style={{ color: "var(--term-text-dim)", fontSize: 11 }}>
              Edit content in the right panel, then post when ready.
            </div>
            {state.revisingLog && (
              <div style={{ marginTop: 8, color: "var(--term-yellow)" }}>
                ↻ {state.revisingLog}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ── Right Panel ─────────────────────────────────────────────────────────────
  const showActions = state.stage === "preview" || state.stage === "done";

  const right = (
    <div className="preview-panel">
      <div className="preview-panel__header">
        <span className="preview-panel__title">Preview</span>
        {state.stage === "preview" && (
          <span className="preview-panel__badge">{Object.keys(state.texts).length} platforms</span>
        )}
      </div>
      <div className="preview-panel__body">
        {state.stage === "loading" && (
          <div className="preview-panel__empty">
            <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
          </div>
        )}

        {(state.stage === "preview" || state.stage === "done") && (
          <>
            {state.screenshotIndices.length > 0 && sessionId && (
              <>
                <div className="section-heading">Screenshots</div>
                <ScreenshotGallery sessionId={sessionId} indices={state.screenshotIndices} />
              </>
            )}

            <div className="section-heading">Platform Content</div>
            {Object.entries(state.texts).map(([key, text]) => (
              <PlatformTextEditor
                key={key}
                platformKey={key}
                value={text}
                onChange={updateText}
                onPreview={togglePreview}
                previewActive={activePreviewKey === key}
              />
            ))}

            {state.postResults.length > 0 && (
              <>
                <div className="section-heading">Results</div>
                <PostResults results={state.postResults} dryRun={dryRun} />
              </>
            )}
          </>
        )}

        {state.stage === "posting" && (
          <div className="preview-panel__empty">
            <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--preview-text-dim)" }}>
              posting...
            </span>
          </div>
        )}

        {state.stage === "error" && (
          <div className="preview-panel__empty" style={{ color: "var(--preview-error)" }}>
            {state.error}
          </div>
        )}
      </div>

      {showActions && (
        <>
          <div className="revise-bar">
            <input
              className="revise-bar__input"
              placeholder="Feedback to revise content..."
              value={reviseInput}
              onChange={(e) => setReviseInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && reviseInput.trim()) revise();
              }}
            />
            <button
              className="btn btn--secondary btn--sm"
              onClick={revise}
              disabled={!reviseInput.trim() || !!state.revisingLog}
            >
              revise
            </button>
          </div>

          <div className="post-actions">
            <button
              className="btn btn--primary"
              onClick={() => post(false)}
              disabled={state.stage === "posting"}
            >
              Post
            </button>
            <button
              className="btn btn--secondary"
              onClick={() => post(true)}
              disabled={state.stage === "posting"}
            >
              Dry Run
            </button>
            <span className="post-actions__hint">
              {state.stage === "posting" ? "posting..." : "ready to publish"}
            </span>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      <SplitPane left={left} right={right} />
      {activePreviewKey && state.texts[activePreviewKey] && (
        <ContentPreview
          platformKey={activePreviewKey}
          text={state.texts[activePreviewKey]}
          sessionId={sessionId}
          onClose={() => setActivePreviewKey(null)}
        />
      )}
    </>
  );
}
