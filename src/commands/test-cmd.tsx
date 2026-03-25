import React, { useState, useEffect } from "react";
import { Box, Text, render, useApp } from "ink";
import { loadConfig, configExists } from "../config/store.js";
import { createAdapters, postToAll, type PostOptions } from "../core/engine.js";
import type { PostResult } from "../adapters/types.js";
import { PostSummary } from "../ui/PostSummary.js";
import { PlatformStatusLine, type StatusState } from "../ui/PlatformStatus.js";
import { ErrorBox } from "../ui/ErrorBox.js";

function TestUI({ platform }: { platform?: string }) {
  const { exit } = useApp();
  const [results, setResults] = useState<PostResult[]>([]);
  const [done, setDone] = useState(false);
  const [startTime] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      if (!configExists()) {
        setError("No config found. Run: crosspost init");
        setDone(true);
        return;
      }

      const config = loadConfig();
      const options: PostOptions = {
        only: platform ? [platform] : undefined,
      };
      const adapters = createAdapters(config);

      if (adapters.size === 0) {
        setError("No platforms configured. Run: crosspost init");
        setDone(true);
        return;
      }

      const content = {
        text: "[CrossPost Test] ✓ Connection working — " + new Date().toISOString(),
      };

      const allResults = await postToAll(adapters, content, options);
      setResults(allResults);
      setDone(true);
    }
    run();
  }, []);

  useEffect(() => {
    if (done) {
      const timer = setTimeout(() => exit(), 100);
      return () => clearTimeout(timer);
    }
  }, [done]);

  if (error) return <ErrorBox message={error} />;

  if (done) {
    return <PostSummary results={results} totalTime={Date.now() - startTime} />;
  }

  return (
    <Box paddingX={1}>
      <Text>Sending test messages...</Text>
    </Box>
  );
}

export async function runTestCommand(platform?: string): Promise<void> {
  const { waitUntilExit } = render(<TestUI platform={platform} />);
  await waitUntilExit();
}
