import React from "react";
import { Box, Text } from "ink";

interface ErrorBoxProps {
  title?: string;
  message: string;
  suggestion?: string;
}

export function ErrorBox({ title, message, suggestion }: ErrorBoxProps) {
  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color="red" bold>
          {title ? `✗ ${title}` : "✗ Error"}
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>{message}</Text>
      </Box>
      {suggestion && (
        <Box marginLeft={2} marginTop={1}>
          <Text dimColor>{suggestion}</Text>
        </Box>
      )}
    </Box>
  );
}
