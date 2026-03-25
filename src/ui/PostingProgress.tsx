import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { PlatformStatusLine, type StatusState } from "./PlatformStatus.js";
import type { PostResult } from "../adapters/types.js";
import type { PostingEvent } from "../core/engine.js";

interface PlatformEntry {
  key: string;
  name: string;
  channel?: string;
  status: StatusState;
  detail?: string;
}

interface PostingProgressProps {
  platforms: Array<{ key: string; name: string; channels?: string[] }>;
  onEvent: (handler: (event: PostingEvent) => void) => void;
  results: PostResult[];
}

export function PostingProgress({ platforms, results }: PostingProgressProps) {
  const entries: PlatformEntry[] = [];

  for (const p of platforms) {
    const platformResults = results.filter(
      (r) => r.platform.toLowerCase().replace(/[/\s]/g, "") === p.key.toLowerCase().replace(/[/\s]/g, "") ||
             r.platform === p.name
    );

    if (platformResults.length > 0) {
      for (const r of platformResults) {
        entries.push({
          key: `${p.key}-${r.channel ?? "default"}`,
          name: p.name,
          channel: r.channel,
          status: r.success ? "success" : "error",
          detail: r.success
            ? r.url
              ? `sent → ${r.url}`
              : `sent (${r.durationMs}ms)`
            : r.error ?? "failed",
        });
      }
    } else {
      entries.push({
        key: p.key,
        name: p.name,
        status: "posting",
        detail: "sending...",
      });
    }
  }

  const completed = entries.filter((e) => e.status === "success" || e.status === "error").length;
  const total = entries.length;
  const allDone = completed === total;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>{allDone ? "● Posting complete" : `● Posting to ${total} platform${total === 1 ? "" : "s"}...`}</Text>
      </Box>
      {entries.map((e) => (
        <PlatformStatusLine key={e.key} name={e.name} status={e.status} detail={e.detail} channel={e.channel} />
      ))}
      <Box marginTop={1}>
        <Text dimColor>
          {completed}/{total} complete
        </Text>
      </Box>
    </Box>
  );
}
