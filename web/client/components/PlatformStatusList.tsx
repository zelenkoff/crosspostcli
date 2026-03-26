import React from "react";
import type { PlatformStatusDTO } from "../../shared/api-types.js";

interface PlatformStatusListProps {
  platforms: PlatformStatusDTO[];
}

function statusIcon(status: PlatformStatusDTO["status"]): { icon: string; cls: string } {
  switch (status) {
    case "success":     return { icon: "✓", cls: "status-icon--success" };
    case "error":       return { icon: "✕", cls: "status-icon--error" };
    case "skipped":     return { icon: "–", cls: "status-icon--skipped" };
    case "validating":  return { icon: "⟳", cls: "status-icon--validating" };
  }
}

export function PlatformStatusList({ platforms }: PlatformStatusListProps) {
  const active = platforms.filter((p) => p.status === "success").length;
  const errors = platforms.filter((p) => p.status === "error").length;
  const skipped = platforms.filter((p) => p.status === "skipped").length;

  return (
    <div className="platform-status-list">
      <div className="platform-status-list__header">platforms</div>
      {platforms.map((p) => {
        const { icon, cls } = statusIcon(p.status);
        return (
          <div key={p.key} className="status-row">
            <div className={`status-row__icon ${cls}`}>{icon}</div>
            <div className="status-row__name">{p.name}</div>
            <div className="status-row__detail">{p.detail}</div>
          </div>
        );
      })}
      <div className="status-summary">
        {active} active
        {errors > 0 && `, ${errors} error${errors > 1 ? "s" : ""}`}
        {skipped > 0 && `, ${skipped} not configured`}
      </div>
    </div>
  );
}
