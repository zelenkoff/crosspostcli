import React from "react";
import { screenshotUrl } from "../api/client";

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
          <a
            key={idx}
            className="screenshot-thumb"
            href={screenshotUrl(sessionId, idx)}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open screenshot ${idx + 1} full size`}
          >
            <span className="screenshot-thumb__index">#{idx + 1}</span>
            <img
              src={screenshotUrl(sessionId, idx)}
              alt={`Screenshot ${idx + 1}`}
              loading="lazy"
            />
          </a>
        ))}
      </div>
    </div>
  );
}
