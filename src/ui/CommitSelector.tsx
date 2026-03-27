import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { CommitInfo } from "../core/changelog.js";

interface CommitSelectorProps {
  commits: CommitInfo[];
  onConfirm: (selected: CommitInfo[]) => void;
  onAbort: () => void;
}

const TYPE_COLOR: Record<CommitInfo["type"], string> = {
  feat: "green",
  fix: "yellow",
  docs: "blue",
  chore: "gray",
  refactor: "cyan",
  perf: "magenta",
  test: "blue",
  other: "gray",
};

export function CommitSelector({ commits, onConfirm, onAbort }: CommitSelectorProps) {
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(
    new Set(commits.map((_, i) => i)), // all checked by default
  );

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor((c) => Math.min(commits.length - 1, c + 1));
    } else if (input === " ") {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(cursor)) next.delete(cursor);
        else next.add(cursor);
        return next;
      });
    } else if (input === "a" || input === "A") {
      // Toggle all
      setSelected((prev) =>
        prev.size === commits.length ? new Set() : new Set(commits.map((_, i) => i)),
      );
    } else if (key.return) {
      const selectedCommits = commits.filter((_, i) => selected.has(i));
      if (selectedCommits.length > 0) {
        onConfirm(selectedCommits);
      }
    } else if (key.escape) {
      onAbort();
    }
  });

  const selectedCount = selected.size;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1} flexDirection="column">
        <Text bold color="cyan">Select commits to include</Text>
        <Text dimColor>
          ↑↓ navigate  ·  Space toggle  ·  A toggle all  ·  Enter confirm  ·  Esc quit
        </Text>
      </Box>

      {commits.map((commit, i) => {
        const isActive = i === cursor;
        const isChecked = selected.has(i);
        const typeColor = TYPE_COLOR[commit.type] ?? "white";
        const typeLabel = commit.scope ? `${commit.type}(${commit.scope})` : commit.type;

        return (
          <Box key={i}>
            <Text color={isActive ? "cyan" : undefined}>
              {isActive ? "▶ " : "  "}
            </Text>
            <Text color={isChecked ? "green" : "gray"}>
              {isChecked ? "✓" : "○"}
            </Text>
            <Text> </Text>
            <Text dimColor>{commit.hash.slice(0, 7)}</Text>
            <Text> </Text>
            <Text color={typeColor}>[{typeLabel}]</Text>
            <Text> </Text>
            <Text color={isChecked ? undefined : "gray"}>{commit.subject}</Text>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>
          {selectedCount} of {commits.length} selected
          {selectedCount === 0 && <Text color="red"> (select at least one)</Text>}
        </Text>
      </Box>
    </Box>
  );
}
