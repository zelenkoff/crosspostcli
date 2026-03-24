import React from "react";
import { Box, Text } from "ink";
import type { PostResult } from "../adapters/types.js";

interface PostSummaryProps {
  results: PostResult[];
  totalTime: number;
}

export function PostSummary({ results, totalTime }: PostSummaryProps) {
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);

  return (
    <Box flexDirection="column" paddingX={1}>
      {successes.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {successes.map((r, i) => (
            <Box key={i}>
              <Text color="green">{"✓ "}</Text>
              <Text>
                {r.platform}
                {r.channel ? ` ${r.channel}` : ""}
              </Text>
              {r.url && (
                <Text dimColor>
                  {" → "}
                  {r.url}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}
      {failures.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {failures.map((r, i) => (
            <Box key={i}>
              <Text color="red">{"✗ "}</Text>
              <Text>
                {r.platform}
                {r.channel ? ` ${r.channel}` : ""}
              </Text>
              <Text dimColor>
                {" → "}
                {r.error}
              </Text>
            </Box>
          ))}
        </Box>
      )}
      <Box>
        <Text bold>
          {successes.length}/{results.length} posted
        </Text>
        <Text dimColor> in {(totalTime / 1000).toFixed(1)}s</Text>
      </Box>
    </Box>
  );
}
