import React, { useState } from "react";
import { SplitPane } from "../components/SplitPane.js";
import { ComposeForm } from "../components/ComposeForm.js";
import { ProgressLog } from "../components/ProgressLog.js";
import { ContentPlanCard } from "../components/ContentPlanCard.js";
import { PlatformTextEditor } from "../components/PlatformTextEditor.js";
import { ScreenshotGallery } from "../components/ScreenshotGallery.js";
import { PostResults } from "../components/PostResults.js";
import { useAnnounce } from "../hooks/useAnnounce.js";
import { useSSE } from "../hooks/useSSE.js";

export function AnnouncePage() {
  const { state, generate, onSSEEvent, continuePlan, abortPlan, updateText, revise, post, reset } = useAnnounce();
  const [reviseInput, setReviseInput] = useState("");
  const [dryRunResults, setDryRunResults] = useState<boolean>(false);

  useSSE(state.streamUrl, onSSEEvent);

  const isRunning = state.stage === "starting" || state.stage === "running";
  const isPosting = state.stage === "posting";

  // ── Left Panel ───────────────────────────────────────────────────────────
  const left = (
    <div className="terminal-panel">
      <div className="terminal-panel__header">
        <div className="terminal-panel__dots">
          <div className="terminal-panel__dot terminal-panel__dot--red" />
          <div className="terminal-panel__dot terminal-panel__dot--yellow" />
          <div className="terminal-panel__dot terminal-panel__dot--green" />
        </div>
        <span className="terminal-panel__title">crosspost announce</span>
      </div>
      <div className="terminal-panel__body">
        <ComposeForm onSubmit={generate} disabled={isRunning || isPosting} />

        <ProgressLog
          logs={state.logs}
          running={isRunning}
        />

        {state.stage === "error" && state.error && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--preview-error)" }}>
            error › {state.error}
            <div style={{ marginTop: 8 }}>
              <button className="btn btn--secondary btn--sm" onClick={reset}>↺ reset</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Right Panel content based on stage ──────────────────────────────────
  let rightContent: React.ReactNode;

  if (state.stage === "idle") {
    rightContent = (
      <div className="preview-panel__empty">
        <div className="preview-panel__empty-icon">◈</div>
        <span>Enter a description and press generate</span>
        <span style={{ fontSize: 10, color: "var(--preview-text-dim)", opacity: 0.6 }}>Preview will appear here</span>
      </div>
    );
  } else if (state.stage === "plan-review" && state.contentPlan) {
    rightContent = (
      <>
        <div className="section-heading">Content Plan</div>
        <ContentPlanCard
          plan={state.contentPlan}
          onContinue={continuePlan}
          onAbort={abortPlan}
        />
      </>
    );
  } else if ((state.stage === "preview" || state.stage === "done") && Object.keys(state.texts).length > 0) {
    rightContent = (
      <>
        {state.screenshotIndices.length > 0 && state.sessionId && (
          <>
            <div className="section-heading">Screenshots</div>
            <ScreenshotGallery
              sessionId={state.sessionId}
              indices={state.screenshotIndices}
            />
          </>
        )}

        <div className="section-heading">Platform Content</div>
        {Object.entries(state.texts).map(([key, text]) => (
          <PlatformTextEditor
            key={key}
            platformKey={key}
            value={text}
            onChange={updateText}
          />
        ))}

        {state.postResults.length > 0 && (
          <>
            <div className="section-heading">Results</div>
            <PostResults results={state.postResults} dryRun={dryRunResults} />
          </>
        )}
      </>
    );
  } else if (state.stage === "running" || state.stage === "starting" || state.stage === "posting") {
    rightContent = (
      <div className="preview-panel__empty">
        <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--preview-text-dim)" }}>
          {state.stage === "posting" ? "posting..." : "generating..."}
        </span>
      </div>
    );
  }

  // ── Post actions bar ─────────────────────────────────────────────────────
  const showActions = state.stage === "preview" || state.stage === "done";

  const right = (
    <div className="preview-panel">
      <div className="preview-panel__header">
        <span className="preview-panel__title">Preview</span>
        {state.stage === "preview" && (
          <span className="preview-panel__badge">
            {Object.keys(state.texts).length} platforms
          </span>
        )}
      </div>
      <div className="preview-panel__body">
        {rightContent}
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
                if (e.key === "Enter" && reviseInput.trim()) {
                  revise(reviseInput.trim());
                  setReviseInput("");
                }
              }}
            />
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => { revise(reviseInput.trim()); setReviseInput(""); }}
              disabled={!reviseInput.trim()}
            >
              revise
            </button>
          </div>

          <div className="post-actions">
            <button
              className="btn btn--primary"
              onClick={() => { setDryRunResults(false); post(false); }}
              disabled={isPosting}
            >
              Post
            </button>
            <button
              className="btn btn--secondary"
              onClick={() => { setDryRunResults(true); post(true); }}
              disabled={isPosting}
            >
              Dry Run
            </button>
            <button className="btn btn--ghost" onClick={reset}>Reset</button>
            <span className="post-actions__hint">
              {isPosting ? "posting..." : "ready to publish"}
            </span>
          </div>
        </>
      )}
    </div>
  );

  return <SplitPane left={left} right={right} />;
}
