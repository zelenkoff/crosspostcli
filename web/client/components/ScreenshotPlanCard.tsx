import React, { useState } from "react";
import type { ScreenshotInstructionDTO, ScreenshotPlanDTO } from "../../shared/api-types";

interface ScreenshotPlanCardProps {
  plan: ScreenshotPlanDTO;
  onConfirm: (screenshots: ScreenshotInstructionDTO[]) => void;
  onAbort: () => void;
}

export function ScreenshotPlanCard({ plan, onConfirm, onAbort }: ScreenshotPlanCardProps) {
  const [shots, setShots] = useState<ScreenshotInstructionDTO[]>(
    plan.screenshots.map((s) => ({ ...s }))
  );

  const update = (i: number, field: keyof ScreenshotInstructionDTO, value: string) => {
    setShots((prev) => prev.map((s, idx) => idx === i ? { ...s, [field]: value || undefined } : s));
  };

  const remove = (i: number) => setShots((prev) => prev.filter((_, idx) => idx !== i));

  const add = () => setShots((prev) => [...prev, { url: "", description: "" }]);

  return (
    <div className="plan-card fade-in">
      <div className="plan-card__title">📸 SCREENSHOT PLAN — REVIEW REQUIRED</div>

      <div className="plan-card__section">
        <div className="plan-card__label">AI REASONING</div>
        <div className="plan-card__value" style={{ fontStyle: "italic", color: "var(--preview-text-dim)" }}>
          {plan.reasoning}
        </div>
      </div>

      <div className="plan-card__label" style={{ marginTop: 16, marginBottom: 8 }}>
        SCREENSHOT INSTRUCTIONS — edit URLs and selectors before capturing
      </div>

      {shots.map((shot, i) => (
        <div key={i} className="screenshot-plan-item">
          <div className="screenshot-plan-item__header">
            <span className="screenshot-plan-item__num">#{i + 1}</span>
            <button
              className="screenshot-plan-item__remove"
              onClick={() => remove(i)}
              title="Remove"
            >✕</button>
          </div>
          <div className="screenshot-plan-item__field">
            <label>URL</label>
            <input
              className="form-input"
              value={shot.url}
              onChange={(e) => update(i, "url", e.target.value)}
              placeholder="http://localhost:3001/your-page"
            />
          </div>
          <div className="screenshot-plan-item__field">
            <label>Selector <span style={{ opacity: 0.5 }}>(optional — leave empty for full page)</span></label>
            <input
              className="form-input"
              value={shot.selector ?? ""}
              onChange={(e) => update(i, "selector", e.target.value)}
              placeholder="e.g. .dashboard-section (only if you know it exists)"
            />
          </div>
          <div className="screenshot-plan-item__field">
            <label>Description</label>
            <input
              className="form-input"
              value={shot.description}
              onChange={(e) => update(i, "description", e.target.value)}
              placeholder="What this screenshot shows"
            />
          </div>
        </div>
      ))}

      <button className="btn btn--ghost btn--sm" onClick={add} style={{ marginTop: 8 }}>
        + add screenshot
      </button>

      <div className="plan-card__actions">
        <button
          className="btn btn--primary"
          onClick={() => onConfirm(shots.filter((s) => s.url.trim()))}
          disabled={shots.filter((s) => s.url.trim()).length === 0}
        >
          Capture Screenshots ›
        </button>
        <button className="btn btn--danger" onClick={onAbort}>Abort</button>
      </div>
    </div>
  );
}
