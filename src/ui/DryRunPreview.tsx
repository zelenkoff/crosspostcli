import React from "react";
import { Box, Text } from "ink";
import type { Adapter } from "../adapters/types.js";

interface DryRunPreviewProps {
  text: string;
  adapters: Map<string, Adapter>;
  url?: string;
}

export function DryRunPreview({ text, adapters, url }: DryRunPreviewProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          [DRY RUN] Preview — no posts will be sent
        </Text>
      </Box>
      {Array.from(adapters.entries()).map(([key, adapter]) => {
        const formatted = adapter.formatText(text);
        const charCount = formatted.length;
        const maxLen = adapter.maxTextLength;
        const truncated = charCount < text.length;

        return (
          <Box key={key} flexDirection="column" marginBottom={1}>
            <Box>
              <Text bold color="cyan">
                {adapter.name}
              </Text>
              <Text dimColor>
                {" "}
                ({charCount}/{maxLen} chars{truncated ? ", truncated" : ""})
              </Text>
            </Box>
            <Box marginLeft={2}>
              <Text>{formatted}</Text>
            </Box>
            {url && (
              <Box marginLeft={2}>
                <Text dimColor>+ {url}</Text>
              </Box>
            )}
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>Run without --dry-run to post for real.</Text>
      </Box>
    </Box>
  );
}
