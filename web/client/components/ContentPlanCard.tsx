import React, { useState } from "react";
import type { ContentPlanDTO } from "../../shared/api-types";

interface ContentPlanCardProps {
  plan: ContentPlanDTO;
  onContinue: (feedback?: string) => void;
  onAbort: () => void;
}

export function ContentPlanCard({ plan, onContinue, onAbort }: ContentPlanCardProps) {
  const [feedback, setFeedback] = useState("");

  return (
    <div className="plan-card fade-in">
      <div className="plan-card__header">
        <span className="plan-card__icon">📋</span>
        <span className="plan-card__title">Content Plan — Review Required</span>
      </div>

      <div className="plan-card__body">
        <div className="plan-field">
          <div className="plan-field__label">Narrative Angle</div>
          <div className="plan-field__value">{plan.narrativeAngle}</div>
        </div>

        <div className="plan-field">
          <div className="plan-field__label">Target Audience</div>
          <div className="plan-field__value">{plan.targetAudience}</div>
        </div>

        <div className="plan-field">
          <div className="plan-field__label">Key Changes</div>
          <ul className="plan-field__list">
            {plan.keyChanges.map((change, i) => (
              <li key={i} className="plan-field__list-item">{change}</li>
            ))}
          </ul>
        </div>

        {plan.suggestedTone && (
          <div className="plan-field">
            <div className="plan-field__label">Suggested Tone</div>
            <div className="plan-field__value">{plan.suggestedTone}</div>
          </div>
        )}
      </div>

      <div className="plan-card__feedback">
        <label className="form-label">Revision Feedback (optional)</label>
        <textarea
          className="form-textarea"
          placeholder="Leave empty to continue, or describe what to change..."
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={2}
        />
      </div>

      <div className="plan-card__actions">
        <button
          className="btn btn--primary btn--sm"
          onClick={() => onContinue(feedback || undefined)}
        >
          {feedback.trim() ? "Revise Plan" : "Continue ›"}
        </button>
        <button className="btn btn--danger btn--sm" onClick={onAbort}>
          Abort
        </button>
      </div>
    </div>
  );
}
