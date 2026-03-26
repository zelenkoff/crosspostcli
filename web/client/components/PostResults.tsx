import React from "react";
import type { PostResultDTO } from "../../shared/api-types";

interface PostResultsProps {
  results: PostResultDTO[];
  dryRun?: boolean;
}

export function PostResults({ results, dryRun }: PostResultsProps) {
  return (
    <div className="post-results fade-in">
      <div className="post-results__title">
        {dryRun ? "Dry Run Results" : "Post Results"}
      </div>
      {results.map((r, i) => (
        <div key={i} className="result-row">
          <div
            className={`result-row__indicator ${
              !r.success ? "result-row__indicator--error" :
              dryRun ? "result-row__indicator--dry" :
              "result-row__indicator--ok"
            }`}
          />
          <span className="result-row__platform">{r.platform}</span>
          {r.success && r.url && !dryRun && (
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="result-row__url"
              title={r.url}
            >
              {r.url}
            </a>
          )}
          {r.success && dryRun && (
            <span className="result-row__dry">dry run ✓</span>
          )}
          {!r.success && (
            <span className="result-row__error">{r.error ?? "failed"}</span>
          )}
        </div>
      ))}
    </div>
  );
}
