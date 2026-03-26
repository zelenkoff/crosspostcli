import React, { useEffect, useRef } from "react";
import type { LogLine } from "../hooks/useAnnounce";

interface ProgressLogProps {
  logs: LogLine[];
  running: boolean;
}

export function ProgressLog({ logs, running }: ProgressLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (logs.length === 0 && !running) return null;

  return (
    <div className="progress-log">
      <div className="progress-log__title">output</div>
      {logs.map((line, i) => (
        <div
          key={i}
          className={`log-line${i === logs.length - 1 ? " log-line--latest" : ""}`}
        >
          <span className="log-line__phase">{line.phase}</span>
          <span className="log-line__sep">›</span>
          <span className="log-line__detail">{line.detail}</span>
        </div>
      ))}
      {running && (
        <div className="log-line log-line--latest">
          <span className="log-line__phase">running</span>
          <span className="log-line__sep">›</span>
          <span className="log-line__detail">
            waiting<span className="log-cursor" />
          </span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
