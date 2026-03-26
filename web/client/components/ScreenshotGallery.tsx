import React from "react";
import { screenshotUrl } from "../api/client.js";

interface ScreenshotGalleryProps {
  sessionId: string;
  indices: number[];
}

export function ScreenshotGallery({ sessionId, indices }: ScreenshotGalleryProps) {
  if (indices.length === 0) return null;

  return (
    <div className="screenshot-gallery fade-in">
      <div className="screenshot-gallery__title">Screenshots ({indices.length})</div>
      <div className="screenshot-gallery__grid">
        {indices.map((idx) => (
          <div key={idx} className="screenshot-thumb">
            <span className="screenshot-thumb__index">#{idx + 1}</span>
            <img
              src={screenshotUrl(sessionId, idx)}
              alt={`Screenshot ${idx + 1}`}
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
