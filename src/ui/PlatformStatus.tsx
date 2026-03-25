import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export type StatusState = "pending" | "posting" | "validating" | "success" | "error" | "skipped";

interface PlatformStatusLineProps {
  name: string;
  status: StatusState;
  detail?: string;
  channel?: string;
}

function StatusIcon({ status }: { status: StatusState }) {
  switch (status) {
    case "pending":
      return <Text dimColor>{"○"}</Text>;
    case "posting":
    case "validating":
      return (
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
      );
    case "success":
      return <Text color="green">{"✓"}</Text>;
    case "error":
      return <Text color="red">{"✗"}</Text>;
    case "skipped":
      return <Text dimColor>{"–"}</Text>;
  }
}

export function PlatformStatusLine({ name, status, detail, channel }: PlatformStatusLineProps) {
  const label = channel ? `${name} ${channel}` : name;

  return (
    <Box>
      <Box width={2}>
        <StatusIcon status={status} />
      </Box>
      <Box width={24}>
        <Text bold={status === "posting" || status === "validating"}>{label}</Text>
      </Box>
      {detail && (
        <Text dimColor>
          {"→ "}
          {detail}
        </Text>
      )}
    </Box>
  );
}
