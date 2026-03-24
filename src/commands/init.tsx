import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, render, useInput, useApp } from "ink";
import { loadConfig, saveConfig } from "../config/store.js";
import { PLATFORM_NAMES, type PlatformName, type Config } from "../config/schema.js";
import { StepIndicator } from "../ui/StepIndicator.js";
import { SuccessBox } from "../ui/SuccessBox.js";
import { ErrorBox } from "../ui/ErrorBox.js";
import { createAdapters, validateAll } from "../core/engine.js";

const PLATFORM_DISPLAY: Record<string, string> = {
  telegram: "Telegram",
  x: "X / Twitter",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  medium: "Medium",
  discord: "Discord",
  blog: "Blog (MDX/MD)",
};

const PLATFORM_FIELDS: Record<string, Array<{ key: string; label: string; secret: boolean }>> = {
  telegram: [
    { key: "bot_token", label: "Bot Token", secret: true },
    { key: "_channels", label: "Channel ID (e.g., @mychannel)", secret: false },
  ],
  x: [
    { key: "api_key", label: "API Key", secret: true },
    { key: "api_secret", label: "API Secret", secret: true },
    { key: "access_token", label: "Access Token", secret: true },
    { key: "access_secret", label: "Access Secret", secret: true },
  ],
  bluesky: [
    { key: "handle", label: "Handle (e.g., user.bsky.social)", secret: false },
    { key: "app_password", label: "App Password", secret: true },
  ],
  mastodon: [
    { key: "instance_url", label: "Instance URL (e.g., https://mastodon.social)", secret: false },
    { key: "access_token", label: "Access Token", secret: true },
  ],
  medium: [{ key: "integration_token", label: "Integration Token", secret: true }],
  discord: [{ key: "_webhook_url", label: "Webhook URL", secret: true }],
  blog: [{ key: "content_dir", label: "Content directory path", secret: false }],
};

type Step = "welcome" | "select" | "credentials" | "testing" | "complete";

function InitWizard() {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>("welcome");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [currentPlatformIndex, setCurrentPlatformIndex] = useState(0);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [config, setConfig] = useState<Config>(loadConfig());
  const [validationResults, setValidationResults] = useState<Map<string, boolean>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const platformList = Array.from(PLATFORM_NAMES);
  const selectedList = platformList.filter((p) => selectedPlatforms.has(p));

  useInput((input, key) => {
    if (step === "welcome") {
      if (key.return) setStep("select");
      return;
    }

    if (step === "select") {
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
      if (key.downArrow) setCursor((c) => Math.min(platformList.length - 1, c + 1));
      if (input === " ") {
        setSelectedPlatforms((prev) => {
          const next = new Set(prev);
          const platform = platformList[cursor];
          if (next.has(platform)) next.delete(platform);
          else next.add(platform);
          return next;
        });
      }
      if (key.return && selectedPlatforms.size > 0) {
        setCurrentPlatformIndex(0);
        setCurrentFieldIndex(0);
        setInputValue("");
        setStep("credentials");
      }
      return;
    }

    if (step === "credentials") {
      if (key.return && inputValue.trim()) {
        const platform = selectedList[currentPlatformIndex];
        const fields = PLATFORM_FIELDS[platform] ?? [];
        const field = fields[currentFieldIndex];

        // Store the value
        const newConfig = { ...config };
        const platConfig = { ...newConfig.platforms[platform as keyof typeof newConfig.platforms] } as Record<string, unknown>;
        platConfig.enabled = true;

        if (field.key === "_channels") {
          // Telegram channels
          const channels = (platConfig.channels as Array<{ id: string }>) ?? [];
          channels.push({ id: inputValue.trim() });
          platConfig.channels = channels;
        } else if (field.key === "_webhook_url") {
          // Discord webhooks
          const webhooks = (platConfig.webhooks as Array<{ url: string }>) ?? [];
          webhooks.push({ url: inputValue.trim() });
          platConfig.webhooks = webhooks;
        } else {
          platConfig[field.key] = inputValue.trim();
        }

        (newConfig.platforms as Record<string, unknown>)[platform] = platConfig;
        setConfig(newConfig as Config);
        setInputValue("");

        // Move to next field or next platform
        if (currentFieldIndex < fields.length - 1) {
          setCurrentFieldIndex(currentFieldIndex + 1);
        } else if (currentPlatformIndex < selectedList.length - 1) {
          setCurrentPlatformIndex(currentPlatformIndex + 1);
          setCurrentFieldIndex(0);
        } else {
          // Save and test
          saveConfig(newConfig as Config);
          setStep("testing");
        }
      } else if (key.backspace || key.delete) {
        setInputValue((v) => v.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setInputValue((v) => v + input);
      }
      return;
    }
  });

  // Run validation when testing
  useEffect(() => {
    if (step !== "testing") return;
    async function test() {
      try {
        const adapters = createAdapters(config);
        const results = await validateAll(adapters);
        setValidationResults(results);
        setStep("complete");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStep("complete");
      }
    }
    test();
  }, [step]);

  // Exit when complete
  useEffect(() => {
    if (step === "complete") {
      const timer = setTimeout(() => exit(), 100);
      return () => clearTimeout(timer);
    }
  }, [step]);

  if (step === "welcome") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {"◆ CrossPost Setup"}
          </Text>
        </Box>
        <Text>Publish to multiple platforms from your terminal.</Text>
        <Text>Bring your own API keys. No server. No subscription.</Text>
        <Box marginTop={1}>
          <Text dimColor>Press Enter to continue...</Text>
        </Box>
      </Box>
    );
  }

  if (step === "select") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {"◆ CrossPost Setup"}
          </Text>
        </Box>
        <Text>Which platforms do you want to connect?</Text>
        <Text dimColor>(use ↑↓ to move, space to select, enter to confirm)</Text>
        <Box flexDirection="column" marginTop={1}>
          {platformList.map((p, i) => (
            <Box key={p}>
              <Text color={cursor === i ? "cyan" : undefined}>
                {cursor === i ? "❯ " : "  "}
                {selectedPlatforms.has(p) ? "◉" : "◯"} {PLATFORM_DISPLAY[p]}
              </Text>
            </Box>
          ))}
        </Box>
        {selectedPlatforms.size > 0 && (
          <Box marginTop={1}>
            <Text dimColor>
              {selectedPlatforms.size} selected — press Enter to continue
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  if (step === "credentials") {
    const platform = selectedList[currentPlatformIndex];
    const fields = PLATFORM_FIELDS[platform] ?? [];
    const field = fields[currentFieldIndex];
    const totalSteps = selectedList.length;
    const currentStep = currentPlatformIndex + 1;

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {"◆ CrossPost Setup"}
          </Text>
        </Box>
        <Text bold>
          Setting up {PLATFORM_DISPLAY[platform]} ({currentStep}/{totalSteps})
        </Text>
        <Box marginTop={1}>
          <Text>{field.label}: </Text>
          <Text color="cyan">{field.secret ? "•".repeat(inputValue.length) : inputValue}</Text>
          <Text>{"█"}</Text>
        </Box>
        <StepIndicator current={currentStep} total={totalSteps} label={PLATFORM_DISPLAY[platform]} />
      </Box>
    );
  }

  if (step === "testing") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {"◆ CrossPost Setup"}
          </Text>
        </Box>
        <Text>Testing connections...</Text>
      </Box>
    );
  }

  // Complete
  const details = selectedList.map((p) => {
    const valid = validationResults.get(p);
    const icon = valid ? "✓" : "✗";
    const color = valid ? "green" : "red";
    return `${icon} ${PLATFORM_DISPLAY[p]} — ${valid ? "connected" : "failed"}`;
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <SuccessBox
        title="Setup complete!"
        message="Config saved to ~/.crosspost/config.json"
        details={details}
      />
      {error && <ErrorBox message={error} />}
      <Box marginTop={1}>
        <Text>
          Run: <Text bold>crosspost "Hello world!"</Text> to post everywhere
        </Text>
      </Box>
    </Box>
  );
}

export async function runInitCommand(): Promise<void> {
  const { waitUntilExit } = render(<InitWizard />);
  await waitUntilExit();
}
