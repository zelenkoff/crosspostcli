import React from "react";
import { Box, Text } from "ink";

interface SuccessBoxProps {
  title?: string;
  message: string;
  details?: string[];
}

export function SuccessBox({ title, message, details }: SuccessBoxProps) {
  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color="green" bold>
          {title ? `✓ ${title}` : "✓ Success"}
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>{message}</Text>
      </Box>
      {details && details.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          {details.map((detail, i) => (
            <Text key={i} dimColor>
              {detail}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
