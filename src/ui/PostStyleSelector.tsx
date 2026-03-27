import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { PostStyle } from "../core/announce-templates.js";

interface Option {
  value: PostStyle;
  label: string;
  description: string;
}

const OPTIONS: Option[] = [
  {
    value: "single-narrative",
    label: "Single narrative",
    description: "One cohesive story that ties all changes together",
  },
  {
    value: "feature-list",
    label: "Feature list",
    description: "Per-feature breakdown, one section per commit",
  },
  {
    value: "auto",
    label: "Auto (let AI decide)",
    description: "AI picks the best structure based on commit count",
  },
];

interface PostStyleSelectorProps {
  onConfirm: (style: PostStyle) => void;
  onAbort: () => void;
}

export function PostStyleSelector({ onConfirm, onAbort }: PostStyleSelectorProps) {
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor((c) => Math.min(OPTIONS.length - 1, c + 1));
    } else if (key.return) {
      onConfirm(OPTIONS[cursor].value);
    } else if (key.escape) {
      onAbort();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1} flexDirection="column">
        <Text bold color="cyan">How should the post be structured?</Text>
        <Text dimColor>↑↓ navigate  ·  Enter confirm  ·  Esc quit</Text>
      </Box>

      {OPTIONS.map((opt, i) => {
        const isActive = i === cursor;
        return (
          <Box key={opt.value} flexDirection="column" marginBottom={0}>
            <Box>
              <Text color={isActive ? "cyan" : undefined}>{isActive ? "▶ " : "  "}</Text>
              <Text bold={isActive} color={isActive ? "white" : undefined}>
                {opt.label}
              </Text>
            </Box>
            <Box>
              <Text>{"    "}</Text>
              <Text dimColor>{opt.description}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
