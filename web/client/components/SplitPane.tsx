import React from "react";

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
}

export function SplitPane({ left, right }: SplitPaneProps) {
  return (
    <div className="split-pane">
      {left}
      <div className="split-pane__divider" />
      {right}
    </div>
  );
}
