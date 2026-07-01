import React from "react";
import { Box, Text } from "ink";

export interface ProgressBarProps {
  current: number;
  total: number;
  width?: number;
}

export default function ProgressBar({
  current,
  total,
  width = 24,
}: ProgressBarProps): React.JSX.Element {
  const safeTotal = Math.max(0, total);
  const clamped =
    safeTotal === 0 ? 0 : Math.min(Math.max(current, 0), safeTotal);
  const percent =
    safeTotal === 0 ? 0 : Math.round((clamped / safeTotal) * 100);
  const filled =
    safeTotal === 0 ? 0 : Math.round((clamped / safeTotal) * width);

  return (
    <Box>
      <Text color="green">{"█".repeat(filled)}</Text>
      <Text dimColor>{"░".repeat(width - filled)}</Text>
      <Text dimColor>{` ${percent}%`}</Text>
    </Box>
  );
}
