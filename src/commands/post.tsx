import React, { useState, useEffect } from "react";
import { Box, Text, render } from "ink";
import { loadConfig } from "../config/store.js";
import { createAdapters, filterAdapters, postToAll, type PostOptions } from "../core/engine.js";
import type { PostResult } from "../adapters/types.js";
import { PostSummary } from "../ui/PostSummary.js";
import { DryRunPreview } from "../ui/DryRunPreview.js";
import { ErrorBox } from "../ui/ErrorBox.js";
import { PlatformStatusLine, type StatusState } from "../ui/PlatformStatus.js";
import { readFileSync } from "fs";

interface PostCommandOptions {
  text?: string;
  from?: string;
  stdin?: boolean;
  image?: string[];
  only?: string[];
  exclude?: string[];
  dryRun?: boolean;
  verbose?: boolean;
  json?: boolean;
  url?: string;
  screenshotUrl?: string;
  screenshotSelector?: string;
  blogSlug?: string;
  blogTitle?: string;
  telegram?: string;
  x?: string;
  bluesky?: string;
  mastodon?: string;
  discord?: string;
  medium?: string;
}

interface PlatformState {
  key: string;
  name: string;
  status: StatusState;
  detail?: string;
  channel?: string;
}

function PostUI({ text, options }: { text: string; options: PostCommandOptions }) {
  const [platformStates, setPlatformStates] = useState<PlatformState[]>([]);
  const [results, setResults] = useState<PostResult[]>([]);
  const [done, setDone] = useState(false);
  const [startTime] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      try {
        const config = loadConfig();
        const postOptions: PostOptions = {
          only: options.only,
          exclude: options.exclude,
          dryRun: options.dryRun,
          verbose: options.verbose,
          blogSlug: options.blogSlug,
          blogTitle: options.blogTitle,
          perPlatformText: {},
        };

        // Collect per-platform text overrides
        if (options.telegram) postOptions.perPlatformText!.telegram = options.telegram;
        if (options.x) postOptions.perPlatformText!.x = options.x;
        if (options.bluesky) postOptions.perPlatformText!.bluesky = options.bluesky;
        if (options.mastodon) postOptions.perPlatformText!.mastodon = options.mastodon;
        if (options.discord) postOptions.perPlatformText!.discord = options.discord;
        if (options.medium) postOptions.perPlatformText!.medium = options.medium;

        const allAdapters = createAdapters(config, postOptions);
        const adapters = filterAdapters(allAdapters, postOptions);

        if (adapters.size === 0) {
          setError("No platforms configured. Run: crosspost init");
          setDone(true);
          return;
        }

        // Load images
        const images: Buffer[] = [];
        if (options.image) {
          for (const imgPath of options.image) {
            images.push(readFileSync(imgPath));
          }
        }

        const content = {
          text,
          images: images.length > 0 ? images : undefined,
          url: options.url,
        };

        // Initialize states
        const initialStates: PlatformState[] = Array.from(adapters.entries()).map(([key, adapter]) => ({
          key,
          name: adapter.name,
          status: "pending" as StatusState,
        }));
        setPlatformStates(initialStates);

        // Post
        const allResults = await postToAll(adapters, content, postOptions, (event) => {
          if (event.type === "start") {
            setPlatformStates((prev) =>
              prev.map((p) =>
                p.name === event.platform ? { ...p, status: "posting", detail: "sending..." } : p,
              ),
            );
          }
          if (event.type === "done") {
            const r = event.result;
            setPlatformStates((prev) =>
              prev.map((p) => {
                if (p.name === r.platform || p.key === r.platform.toLowerCase()) {
                  return {
                    ...p,
                    status: r.success ? "success" : "error",
                    detail: r.success ? (r.url ? `→ ${r.url}` : `sent (${r.durationMs}ms)`) : r.error,
                    channel: r.channel,
                  };
                }
                return p;
              }),
            );
          }
        });

        setResults(allResults);
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setDone(true);
      }
    }
    run();
  }, []);

  if (error) {
    return <ErrorBox message={error} suggestion="Run: crosspost init" />;
  }

  if (done && results.length > 0) {
    return <PostSummary results={results} totalTime={Date.now() - startTime} />;
  }

  // Show live progress
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>{"● Posting..."}</Text>
      </Box>
      {platformStates.map((p) => (
        <PlatformStatusLine key={p.key} name={p.name} status={p.status} detail={p.detail} channel={p.channel} />
      ))}
      <Box marginTop={1}>
        <Text dimColor>
          {platformStates.filter((p) => p.status === "success" || p.status === "error").length}/{platformStates.length}{" "}
          complete
        </Text>
      </Box>
    </Box>
  );
}

export async function runPostCommand(options: PostCommandOptions): Promise<void> {
  let text = options.text ?? "";

  // Read from file
  if (options.from) {
    text = readFileSync(options.from, "utf-8");
  }

  // Read from stdin
  if (options.stdin || (!text && !process.stdin.isTTY)) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    text = Buffer.concat(chunks).toString("utf-8").trim();
  }

  if (!text) {
    console.error("Error: No text provided. Usage: crosspost \"Your message\"");
    process.exit(1);
  }

  // JSON output mode
  if (options.json) {
    const config = loadConfig();
    const postOptions: PostOptions = {
      only: options.only,
      exclude: options.exclude,
      perPlatformText: {},
    };
    const adapters = filterAdapters(createAdapters(config, postOptions), postOptions);

    if (options.dryRun) {
      const preview = Array.from(adapters.entries()).map(([key, adapter]) => ({
        platform: key,
        text: adapter.formatText(text),
        charCount: adapter.formatText(text).length,
        maxLength: adapter.maxTextLength,
      }));
      console.log(JSON.stringify({ dryRun: true, platforms: preview }, null, 2));
      return;
    }

    const images: Buffer[] = [];
    if (options.image) {
      for (const imgPath of options.image) {
        images.push(readFileSync(imgPath));
      }
    }

    const results = await postToAll(adapters, { text, images: images.length > 0 ? images : undefined, url: options.url }, postOptions);
    console.log(JSON.stringify({ results }, null, 2));
    return;
  }

  // Dry run with Ink UI
  if (options.dryRun) {
    const config = loadConfig();
    const postOptions: PostOptions = { only: options.only, exclude: options.exclude };
    const adapters = filterAdapters(createAdapters(config, postOptions), postOptions);

    if (adapters.size === 0) {
      render(<ErrorBox message="No platforms configured." suggestion="Run: crosspost init" />);
      return;
    }

    render(<DryRunPreview text={text} adapters={adapters} url={options.url} />);
    return;
  }

  // Real posting with live UI
  const { waitUntilExit } = render(<PostUI text={text} options={options} />);
  await waitUntilExit();
}
