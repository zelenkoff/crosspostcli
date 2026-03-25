import React from "react";
import { Box, Text } from "ink";

interface StepIndicatorProps {
  current: number;
  total: number;
  label?: string;
}

export function StepIndicator({ current, total, label }: StepIndicatorProps) {
  return (
    <Box marginTop={1}>
      <Text dimColor>
        Step {current} of {total}
        {label ? ` — ${label}` : ""}
      </Text>
    </Box>
  );
}
