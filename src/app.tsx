import React from "react";
import { Box, Text } from "ink";

export function App() {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          CrossPost
        </Text>
        <Text dimColor> v0.1.0</Text>
      </Box>
      <Text>Cross-platform content publishing from the terminal.</Text>
      <Text dimColor>Bring your own keys. No server. No subscription.</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Commands:</Text>
        <Text>  crosspost {"<text>"}         Post to all connected platforms</Text>
        <Text>  crosspost init             Setup wizard — connect platforms</Text>
        <Text>  crosspost status           Show connected platforms</Text>
        <Text>  crosspost config           Show/manage configuration</Text>
        <Text>  crosspost test             Send test message to all platforms</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Options:</Text>
        <Text>  --image {"<path>"}           Attach an image</Text>
        <Text>  --only {"<platforms>"}       Post to specific platforms only</Text>
        <Text>  --exclude {"<platforms>"}    Skip specific platforms</Text>
        <Text>  --dry-run                Preview without posting</Text>
        <Text>  --json                   Output as JSON</Text>
        <Text>  --url {"<url>"}             Append URL to posts</Text>
        <Text>  --from {"<file>"}           Read post text from file</Text>
        <Text>  --stdin                  Read post text from stdin</Text>
        <Text>  --verbose                Show detailed output</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Run: <Text>crosspost init</Text> to get started
        </Text>
      </Box>
    </Box>
  );
}
